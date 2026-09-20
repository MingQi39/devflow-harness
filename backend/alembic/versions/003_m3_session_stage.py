"""Add session stage for M3 closed-loop demo."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003_m3_session_stage"
down_revision: Union[str, None] = "002_m2_tool_messages"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

session_stage = postgresql.ENUM(
    "requirement",
    "prototype",
    "development",
    "qa",
    "done",
    name="session_stage",
    create_type=False,
)


def upgrade() -> None:
    op.execute(
        "CREATE TYPE session_stage AS ENUM "
        "('requirement', 'prototype', 'development', 'qa', 'done')"
    )
    op.add_column(
        "conversations",
        sa.Column(
            "stage",
            session_stage,
            server_default="requirement",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("conversations", "stage")
    op.execute("DROP TYPE session_stage")
