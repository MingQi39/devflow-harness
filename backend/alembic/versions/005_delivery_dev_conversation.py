"""Link prototype deliveries to developer project sessions."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "005_delivery_dev_conversation"
down_revision: Union[str, None] = "004_organizations_deliveries"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "prototype_deliveries",
        sa.Column(
            "dev_conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_prototype_deliveries_dev_conversation",
        "prototype_deliveries",
        ["dev_conversation_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_prototype_deliveries_dev_conversation", "prototype_deliveries")
    op.drop_column("prototype_deliveries", "dev_conversation_id")
