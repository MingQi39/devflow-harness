"""Project sandboxes linked to conversations and prototype deliveries."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "006_project_sandbox"
down_revision: Union[str, None] = "005_delivery_dev_conversation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "owner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source_delivery_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("prototype_deliveries.id", ondelete="SET NULL"),
            nullable=True,
            unique=True,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column(
            "primary_conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_projects_org_id", "projects", ["org_id"])
    op.create_index("ix_projects_owner_id", "projects", ["owner_id"])

    op.add_column(
        "conversations",
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_conversations_project_id", "conversations", ["project_id"])

    op.add_column(
        "prototype_deliveries",
        sa.Column(
            "dev_project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_prototype_deliveries_dev_project",
        "prototype_deliveries",
        ["dev_project_id"],
    )

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "dev_conversation_id" in [
        col["name"] for col in inspector.get_columns("prototype_deliveries")
    ]:
        op.drop_index("ix_prototype_deliveries_dev_conversation", "prototype_deliveries")
        op.drop_column("prototype_deliveries", "dev_conversation_id")


def downgrade() -> None:
    op.add_column(
        "prototype_deliveries",
        sa.Column(
            "dev_conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.drop_index("ix_prototype_deliveries_dev_project", "prototype_deliveries")
    op.drop_column("prototype_deliveries", "dev_project_id")
    op.drop_index("ix_conversations_project_id", "conversations")
    op.drop_column("conversations", "project_id")
    op.drop_table("projects")
