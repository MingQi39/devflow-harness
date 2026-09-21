"""Send prototype snapshots to org colleagues."""

from __future__ import annotations

import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from config import get_settings
from models.prototype_delivery import PrototypeDelivery
from models.user import User, UserRole
from services.conversations import get_owned_conversation
from services.organizations import DEV_RECIPIENT_ROLES, require_org_member
from services.workspace import WorkspaceError, ensure_workspace, read_file


class DeliveryError(ValueError):
    """Prototype delivery failed."""


def _delivery_dir(delivery_id: uuid.UUID) -> Path:
    root = Path(get_settings().deliveries_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    path = root / str(delivery_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _snapshot_prototype(workspace: Path, delivery_id: uuid.UUID) -> None:
    target = _delivery_dir(delivery_id)
    try:
        html = read_file(workspace, "prototype.html")
    except WorkspaceError as exc:
        raise DeliveryError("prototype.html not found in session workspace") from exc
    (target / "prototype.html").write_text(html, encoding="utf-8")
    try:
        md = read_file(workspace, "REQUIREMENTS.md")
        (target / "REQUIREMENTS.md").write_text(md, encoding="utf-8")
    except WorkspaceError:
        pass


def send_prototype_deliveries(
    db: Session,
    *,
    org_id: uuid.UUID,
    sender: User,
    conversation_id: uuid.UUID,
    recipient_ids: list[uuid.UUID],
    title: str,
    message: str,
) -> list[PrototypeDelivery]:
    if sender.role is not UserRole.pm:
        raise DeliveryError("Only PM can send prototype deliveries")
    require_org_member(db, sender.id, org_id)
    conversation = get_owned_conversation(db, sender, conversation_id)
    if not recipient_ids:
        raise DeliveryError("Select at least one recipient")

    workspace = ensure_workspace(conversation_id)
    try:
        read_file(workspace, "prototype.html")
    except WorkspaceError as exc:
        raise DeliveryError("Generate prototype.html before sending") from exc

    recipients: list[User] = []
    for recipient_id in recipient_ids:
        if recipient_id == sender.id:
            continue
        recipient = db.query(User).filter(User.id == recipient_id).first()
        if recipient is None:
            raise DeliveryError("Recipient not found")
        if recipient.role not in DEV_RECIPIENT_ROLES:
            raise DeliveryError("Prototype can only be sent to frontend or backend roles")
        require_org_member(db, recipient.id, org_id)
        recipients.append(recipient)

    if not recipients:
        raise DeliveryError("No valid recipients")

    req_title = title.strip()[:200]
    if not req_title:
        raise DeliveryError("请填写需求标题")
    note = message.strip()
    created: list[PrototypeDelivery] = []

    for recipient in recipients:
        delivery = PrototypeDelivery(
            org_id=org_id,
            conversation_id=conversation_id,
            sender_id=sender.id,
            recipient_id=recipient.id,
            title=req_title,
            message=note,
        )
        db.add(delivery)
        db.flush()
        _snapshot_prototype(workspace, delivery.id)
        created.append(delivery)

    db.commit()
    for item in created:
        db.refresh(item)
    return created


def list_inbox(db: Session, user: User, org_id: uuid.UUID) -> list[PrototypeDelivery]:
    require_org_member(db, user.id, org_id)
    return (
        db.query(PrototypeDelivery)
        .filter(
            PrototypeDelivery.org_id == org_id,
            PrototypeDelivery.recipient_id == user.id,
        )
        .order_by(PrototypeDelivery.created_at.desc())
        .all()
    )


def list_sent(db: Session, user: User, org_id: uuid.UUID) -> list[PrototypeDelivery]:
    require_org_member(db, user.id, org_id)
    return (
        db.query(PrototypeDelivery)
        .filter(
            PrototypeDelivery.org_id == org_id,
            PrototypeDelivery.sender_id == user.id,
        )
        .order_by(PrototypeDelivery.created_at.desc())
        .all()
    )


def get_delivery_for_user(
    db: Session, user: User, org_id: uuid.UUID, delivery_id: uuid.UUID
) -> PrototypeDelivery:
    require_org_member(db, user.id, org_id)
    delivery = (
        db.query(PrototypeDelivery)
        .filter(
            PrototypeDelivery.id == delivery_id,
            PrototypeDelivery.org_id == org_id,
        )
        .first()
    )
    if delivery is None:
        raise DeliveryError("Delivery not found")
    if delivery.recipient_id != user.id and delivery.sender_id != user.id:
        raise DeliveryError("Not allowed to view this delivery")
    return delivery


def mark_delivery_read(
    db: Session, user: User, org_id: uuid.UUID, delivery_id: uuid.UUID
) -> PrototypeDelivery:
    delivery = get_delivery_for_user(db, user, org_id, delivery_id)
    if delivery.recipient_id != user.id:
        raise DeliveryError("Only recipient can mark as read")
    if delivery.read_at is None:
        delivery.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(delivery)
    return delivery


def read_delivery_file(
    delivery_id: uuid.UUID, relative_path: str
) -> str:
    if relative_path not in {"prototype.html", "REQUIREMENTS.md"}:
        raise DeliveryError("File not available")
    target = _delivery_dir(delivery_id) / relative_path
    if not target.is_file():
        raise DeliveryError("File not found in delivery snapshot")
    return target.read_text(encoding="utf-8")


def remove_delivery_files(delivery_id: uuid.UUID) -> None:
    path = _delivery_dir(delivery_id)
    if path.exists():
        shutil.rmtree(path)
