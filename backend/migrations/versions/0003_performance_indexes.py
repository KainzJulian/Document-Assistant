"""Indexes for the library list (1,000 documents), title search and the chat list (500 chats).

Revision ID: 0003
Revises: 0002
"""
from alembic import op

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply the migration."""
    op.create_index('documents_owner_created_ix', 'documents', ['owner_id', 'created_at'])
    op.execute("CREATE INDEX documents_shared_ix ON documents (shared) WHERE shared")
    op.execute("CREATE INDEX documents_title_trgm ON documents USING gin (title gin_trgm_ops)")
    op.create_index('chats_owner_updated_ix', 'chats', ['owner_id', 'updated_at'])
    op.create_index('messages_chat_created_ix', 'messages', ['chat_id', 'created_at'])


def downgrade() -> None:
    """Revert the migration."""
    op.drop_index('messages_chat_created_ix', table_name='messages')
    op.drop_index('chats_owner_updated_ix', table_name='chats')
    op.execute("DROP INDEX documents_title_trgm")
    op.execute("DROP INDEX documents_shared_ix")
    op.drop_index('documents_owner_created_ix', table_name='documents')
