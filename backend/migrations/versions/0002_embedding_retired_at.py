"""Embedding models get ``retired_at`` (old vectors are purged 7 days later); index on model_id.

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply the migration."""
    op.add_column(
        'embedding_models',
        sa.Column('retired_at', sa.DateTime(timezone=True), nullable=True, comment='When the model stopped being active.'),
    )
    op.create_index('chunk_embeddings_model_ix', 'chunk_embeddings', ['model_id'])


def downgrade() -> None:
    """Revert the migration."""
    op.drop_index('chunk_embeddings_model_ix', table_name='chunk_embeddings')
    op.drop_column('embedding_models', 'retired_at')
