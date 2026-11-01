"""Baseline: extensions, all application tables and the Procrastinate queue.

Revision ID: 0001
Revises: 
"""
from alembic import op
import pgvector.sqlalchemy.vector
import sqlalchemy as sa
from procrastinate.schema import SchemaManager
from sqlalchemy.dialects import postgresql

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply the migration."""
    for extension in ("vector", "unaccent", "pg_trgm", "citext"):
        op.execute(f"CREATE EXTENSION IF NOT EXISTS {extension}")
    # NOTE: stock unaccent() is STABLE; generated columns need an IMMUTABLE wrapper.
    op.execute(
        "CREATE FUNCTION immutable_unaccent(text) RETURNS text "
        "LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT "
        "AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$"
    )
    op.create_table('embedding_models',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('provider', sa.Text(), nullable=False),
    sa.Column('model', sa.Text(), nullable=False),
    sa.Column('dims', sa.Integer(), nullable=False),
    sa.Column('status', sa.Text(), nullable=False, comment='building, active or retired.'),
    sa.Column('progress', sa.Float(), server_default=sa.text('0'), nullable=False, comment='0 to 1.'),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("status IN ('building', 'active', 'retired')", name='embedding_models_status_ck'),
    sa.PrimaryKeyConstraint('id'),
    comment='Embedding models; a switch builds the new one while the old keeps serving.'
    )
    op.create_index('embedding_models_one_active', 'embedding_models', ['status'], unique=True, postgresql_where=sa.text("status = 'active'"))
    op.create_table('providers',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('kind', sa.Text(), nullable=False),
    sa.Column('label', sa.Text(), nullable=False),
    sa.Column('base_url', sa.Text(), nullable=True),
    sa.Column('api_key_enc', sa.Text(), nullable=True, comment='Fernet token; never returned by the API.'),
    sa.Column('enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('models', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False, comment='Cached model list.'),
    sa.CheckConstraint("kind IN ('anthropic', 'openai', 'google', 'ollama')", name='providers_kind_ck'),
    sa.PrimaryKeyConstraint('id'),
    comment='Admin-managed AI providers; keys are Fernet-encrypted and write-only.'
    )
    op.create_table('users',
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('username', postgresql.CITEXT(), nullable=False, comment='Login name, case-insensitive.'),
    sa.Column('display_name', sa.Text(), nullable=False),
    sa.Column('password_hash', sa.Text(), nullable=False, comment='argon2id hash.'),
    sa.Column('role', sa.Text(), nullable=False, comment='admin or member.'),
    sa.Column('disabled', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('failed_logins', sa.Integer(), server_default=sa.text('0'), nullable=False, comment='Failed logins in the current window.'),
    sa.Column('failed_window_started_at', sa.DateTime(timezone=True), nullable=True, comment='Start of the 15 minute failed-login window.'),
    sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True, comment='Login refused until this time (5 failures per 15 min).'),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("role IN ('admin', 'member')", name='users_role_ck'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('username'),
    comment='Household accounts (admin and members).'
    )
    op.create_table('chats',
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('owner_id', sa.Uuid(), nullable=False),
    sa.Column('title', sa.Text(), nullable=True),
    sa.Column('provider', sa.Text(), nullable=True),
    sa.Column('model', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    comment='Chats are always private to their owner.'
    )
    op.create_index(op.f('ix_chats_owner_id'), 'chats', ['owner_id'], unique=False)
    op.create_table('documents',
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('owner_id', sa.Uuid(), nullable=False),
    sa.Column('title', sa.Text(), nullable=False),
    sa.Column('source_type', sa.Text(), nullable=False, comment='file, url or text.'),
    sa.Column('filename', sa.Text(), nullable=True),
    sa.Column('mime', sa.Text(), nullable=True),
    sa.Column('size_bytes', sa.BigInteger(), nullable=True),
    sa.Column('url', sa.Text(), nullable=True),
    sa.Column('url_normalized', sa.Text(), nullable=True, comment='Without tracking params and fragment.'),
    sa.Column('content_hash', sa.Text(), nullable=True, comment='SHA-256 of the original bytes.'),
    sa.Column('language', sa.Text(), nullable=True),
    sa.Column('page_count', sa.Integer(), nullable=True),
    sa.Column('word_count', sa.Integer(), nullable=True),
    sa.Column('status', sa.Text(), server_default=sa.text("'queued'"), nullable=False, comment='queued, reading, indexing, ready or failed.'),
    sa.Column('error', sa.Text(), nullable=True, comment='German failure reason.'),
    sa.Column('shared', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("source_type IN ('file', 'url', 'text')", name='documents_source_ck'),
    sa.CheckConstraint("status IN ('queued', 'reading', 'indexing', 'ready', 'failed')", name='documents_status_ck'),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('owner_id', 'content_hash', name='documents_owner_hash_uq'),
    sa.UniqueConstraint('owner_id', 'url_normalized', name='documents_owner_url_uq'),
    comment='Library documents; owner_id scopes every query.'
    )
    op.create_index(op.f('ix_documents_owner_id'), 'documents', ['owner_id'], unique=False)
    op.create_table('ollama_acknowledgements',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('model', sa.Text(), nullable=False),
    sa.Column('verdict', sa.Text(), nullable=False),
    sa.Column('acknowledged_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'model'),
    comment='Lets the hardware dialog re-appear only when the verdict gets worse.'
    )
    op.create_table('sessions',
    sa.Column('id', sa.Text(), nullable=False, comment='SHA-256 hex of the token.'),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    comment='Login sessions; HttpOnly cookie, 30 days sliding.'
    )
    op.create_index(op.f('ix_sessions_user_id'), 'sessions', ['user_id'], unique=False)
    op.create_table('user_settings',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('provider_id', sa.Integer(), nullable=True),
    sa.Column('model', sa.Text(), nullable=True),
    sa.Column('summary_language', sa.Text(), server_default=sa.text("'source'"), nullable=False),
    sa.CheckConstraint("summary_language IN ('source', 'de')", name='user_settings_lang_ck'),
    sa.ForeignKeyConstraint(['provider_id'], ['providers.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id'),
    comment="Each person's provider, model and summary language."
    )
    op.create_table('chat_documents',
    sa.Column('chat_id', sa.Uuid(), nullable=False),
    sa.Column('document_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['chat_id'], ['chats.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('chat_id', 'document_id'),
    comment='Selected sources of a chat; can change during the chat.'
    )
    op.create_table('chunks',
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('document_id', sa.Uuid(), nullable=False),
    sa.Column('ordinal', sa.Integer(), nullable=False),
    sa.Column('section_path', sa.Text(), nullable=True, comment='e.g. Kapitel 2 > Methoden.'),
    sa.Column('page_from', sa.Integer(), nullable=True),
    sa.Column('page_to', sa.Integer(), nullable=True),
    sa.Column('text', sa.Text(), nullable=False),
    sa.Column('word_count', sa.Integer(), nullable=False),
    sa.Column('tsv', postgresql.TSVECTOR(), sa.Computed("to_tsvector('simple', immutable_unaccent(text))", persisted=True), nullable=False),
    sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('document_id', 'ordinal', name='chunks_document_ordinal_uq'),
    comment='Document passages (about 400 words) with section path and page range.'
    )
    op.create_index('chunks_tsv_gin', 'chunks', ['tsv'], unique=False, postgresql_using='gin')
    op.create_table('document_texts',
    sa.Column('document_id', sa.Uuid(), nullable=False),
    sa.Column('markdown', sa.Text(), nullable=False),
    sa.Column('extractor', sa.Text(), nullable=False),
    sa.Column('extracted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('document_id'),
    comment='Extracted Markdown with page or section markers.'
    )
    op.create_table('messages',
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('chat_id', sa.Uuid(), nullable=False),
    sa.Column('role', sa.Text(), nullable=False, comment='user or assistant.'),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('citations', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False, comment='Number to chunk, document and page.'),
    sa.Column('provider', sa.Text(), nullable=True),
    sa.Column('model', sa.Text(), nullable=True),
    sa.Column('tokens_in', sa.Integer(), nullable=True),
    sa.Column('tokens_out', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('tsv', postgresql.TSVECTOR(), sa.Computed("to_tsvector('simple', immutable_unaccent(content))", persisted=True), nullable=False),
    sa.CheckConstraint("role IN ('user', 'assistant')", name='messages_role_ck'),
    sa.ForeignKeyConstraint(['chat_id'], ['chats.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    comment='Chat messages; tsv and trigram indexes power typo-tolerant search.'
    )
    op.create_index(op.f('ix_messages_chat_id'), 'messages', ['chat_id'], unique=False)
    op.create_index('messages_content_trgm', 'messages', ['content'], unique=False, postgresql_using='gin', postgresql_ops={'content': 'gin_trgm_ops'})
    op.create_index('messages_tsv_gin', 'messages', ['tsv'], unique=False, postgresql_using='gin')
    op.create_table('summaries',
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('document_id', sa.Uuid(), nullable=False),
    sa.Column('length', sa.Text(), nullable=False, comment='xs, s, m, l or xl.'),
    sa.Column('text', sa.Text(), nullable=False),
    sa.Column('word_count', sa.Integer(), nullable=False),
    sa.Column('target_words', sa.Integer(), nullable=False),
    sa.Column('provider', sa.Text(), nullable=False),
    sa.Column('model', sa.Text(), nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("length IN ('xs', 's', 'm', 'l', 'xl')", name='summaries_length_ck'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('document_id', 'length', name='summaries_document_length_uq'),
    comment='One summary per document and length, with the model that wrote it.'
    )
    op.create_table('chunk_embeddings',
    sa.Column('chunk_id', sa.Uuid(), nullable=False),
    sa.Column('model_id', sa.Integer(), nullable=False),
    sa.Column('embedding', pgvector.sqlalchemy.vector.VECTOR(), nullable=False),
    sa.ForeignKeyConstraint(['chunk_id'], ['chunks.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['model_id'], ['embedding_models.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('chunk_id', 'model_id'),
    comment='Chunk vectors; one HNSW cosine index per model is created by the re-index job.'
    )
    # Procrastinate job queue. The schema SQL contains '%', so run it without parameters
    # on the raw driver connection (simple query protocol, several statements).
    op.get_bind().connection.driver_connection.execute(SchemaManager.get_schema())


def downgrade() -> None:
    """Revert the migration."""
    op.execute(
        """
        DO $$
        DECLARE fn record;
        BEGIN
            FOR fn IN SELECT oid::regprocedure AS sig FROM pg_proc
                      WHERE proname LIKE 'procrastinate\\_%' AND pronamespace = 'public'::regnamespace
            LOOP
                EXECUTE 'DROP FUNCTION IF EXISTS ' || fn.sig || ' CASCADE';
            END LOOP;
        END $$
        """
    )
    for table in ("events", "periodic_defers", "jobs", "workers"):
        op.execute(f"DROP TABLE IF EXISTS procrastinate_{table} CASCADE")
    for type_name in ("job_event_type", "job_status", "job_to_defer_v1"):
        op.execute(f"DROP TYPE IF EXISTS procrastinate_{type_name} CASCADE")
    op.drop_table('chunk_embeddings')
    op.drop_table('summaries')
    op.drop_index('messages_tsv_gin', table_name='messages', postgresql_using='gin')
    op.drop_index('messages_content_trgm', table_name='messages', postgresql_using='gin', postgresql_ops={'content': 'gin_trgm_ops'})
    op.drop_index(op.f('ix_messages_chat_id'), table_name='messages')
    op.drop_table('messages')
    op.drop_table('document_texts')
    op.drop_index('chunks_tsv_gin', table_name='chunks', postgresql_using='gin')
    op.drop_table('chunks')
    op.drop_table('chat_documents')
    op.drop_table('user_settings')
    op.drop_index(op.f('ix_sessions_user_id'), table_name='sessions')
    op.drop_table('sessions')
    op.drop_table('ollama_acknowledgements')
    op.drop_index(op.f('ix_documents_owner_id'), table_name='documents')
    op.drop_table('documents')
    op.drop_index(op.f('ix_chats_owner_id'), table_name='chats')
    op.drop_table('chats')
    op.drop_table('users')
    op.drop_table('providers')
    op.drop_index('embedding_models_one_active', table_name='embedding_models', postgresql_where=sa.text("status = 'active'"))
    op.drop_table('embedding_models')
    op.execute("DROP FUNCTION IF EXISTS immutable_unaccent(text)")
    for extension in ("citext", "pg_trgm", "unaccent", "vector"):
        op.execute(f"DROP EXTENSION IF EXISTS {extension}")
