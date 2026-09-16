"""Add tool message support for M2 agent loop."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "002_m2_tool_messages"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE message_role ADD VALUE IF NOT EXISTS 'tool'")
    op.add_column(
        "messages",
        sa.Column("tool_calls", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column("messages", sa.Column("tool_call_id", sa.String(length=64), nullable=True))
    op.add_column("messages", sa.Column("tool_name", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "tool_name")
    op.drop_column("messages", "tool_call_id")
    op.drop_column("messages", "tool_calls")
