"""Organizations, contacts, prototype deliveries."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from db import get_db
from deps import require_permission
from models.organization import OrgMember, OrgMembershipRole, Organization
from models.project import Project
from models.prototype_delivery import PrototypeDelivery
from models.user import User
from schemas.organization import (
    InviteCodeOut,
    OrgMemberOut,
    OrganizationCreate,
    OrganizationJoin,
    OrganizationOut,
)
from schemas.dev_project import (
    AnalyzeStackRequest,
    AnalyzeStackResponse,
    DevProjectBootstrapCreate,
    DevProjectBootstrapOut,
)
from schemas.prototype_delivery import (
    DeliveryFileOut,
    PrototypeDeliveryCreate,
    PrototypeDeliveryOut,
)
from services.organizations import (
    OrgError,
    create_organization,
    join_organization_by_invite,
    list_org_members,
    list_user_organizations,
    require_org_member,
)
from services.dev_project_bootstrap import DevProjectError, bootstrap_dev_project_from_delivery
from services.prototype_delivery import (
    DeliveryError,
    get_delivery_for_user,
    list_inbox,
    list_sent,
    mark_delivery_read,
    read_delivery_file,
    send_prototype_deliveries,
)
from services.stack_analysis import analyze_stack

router = APIRouter(prefix="/orgs", tags=["organizations"])


def _require_member(db: Session, user_id: uuid.UUID, org_id: uuid.UUID) -> OrgMember:
    try:
        return require_org_member(db, user_id, org_id)
    except OrgError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc


def _org_out(db: Session, org: Organization, user_id: uuid.UUID) -> OrganizationOut:
    member_count = (
        db.query(func.count(OrgMember.user_id))
        .filter(OrgMember.org_id == org.id)
        .scalar()
        or 0
    )
    membership = (
        db.query(OrgMember)
        .filter(OrgMember.org_id == org.id, OrgMember.user_id == user_id)
        .first()
    )
    return OrganizationOut(
        id=org.id,
        name=org.name,
        invite_code=org.invite_code,
        member_count=int(member_count),
        membership_role=membership.membership_role if membership else None,
    )


def _delivery_out(db: Session, delivery: PrototypeDelivery) -> PrototypeDeliveryOut:
    sender = db.query(User).filter(User.id == delivery.sender_id).first()
    recipient = db.query(User).filter(User.id == delivery.recipient_id).first()
    dev_conversation_id = None
    if delivery.dev_project_id is not None:
        project = db.query(Project).filter(Project.id == delivery.dev_project_id).first()
        if project is not None:
            dev_conversation_id = project.primary_conversation_id
    return PrototypeDeliveryOut(
        id=delivery.id,
        org_id=delivery.org_id,
        conversation_id=delivery.conversation_id,
        sender_id=delivery.sender_id,
        recipient_id=delivery.recipient_id,
        sender_email=sender.email if sender else None,
        recipient_email=recipient.email if recipient else None,
        title=delivery.title,
        message=delivery.message,
        read_at=delivery.read_at,
        dev_project_id=delivery.dev_project_id,
        dev_conversation_id=dev_conversation_id,
        created_at=delivery.created_at,
    )


@router.get("/mine", response_model=list[OrganizationOut])
def list_my_organizations(
    user: Annotated[User, Depends(require_permission("org:read"))],
    db: Annotated[Session, Depends(get_db)],
) -> list[OrganizationOut]:
    orgs = list_user_organizations(db, user.id)
    return [_org_out(db, org, user.id) for org in orgs]


@router.post("", response_model=OrganizationOut, status_code=status.HTTP_201_CREATED)
def create_org(
    body: OrganizationCreate,
    user: Annotated[User, Depends(require_permission("org:create"))],
    db: Annotated[Session, Depends(get_db)],
) -> OrganizationOut:
    try:
        org = create_organization(db, user, body.name)
    except OrgError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _org_out(db, org, user.id)


@router.post("/join", response_model=OrganizationOut)
def join_org(
    body: OrganizationJoin,
    user: Annotated[User, Depends(require_permission("org:read"))],
    db: Annotated[Session, Depends(get_db)],
) -> OrganizationOut:
    try:
        org = join_organization_by_invite(db, user, body.invite_code)
    except OrgError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _org_out(db, org, user.id)


@router.get("/{org_id}/invite-code", response_model=InviteCodeOut)
def get_invite_code(
    org_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("org:manage"))],
    db: Annotated[Session, Depends(get_db)],
) -> InviteCodeOut:
    member = _require_member(db, user.id, org_id)
    if member.membership_role not in {
        OrgMembershipRole.owner,
        OrgMembershipRole.member,
    }:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return InviteCodeOut(invite_code=org.invite_code)


@router.get("/{org_id}/members", response_model=list[OrgMemberOut])
def get_org_members(
    org_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("org:read"))],
    db: Annotated[Session, Depends(get_db)],
) -> list[OrgMemberOut]:
    _require_member(db, user.id, org_id)
    rows = list_org_members(db, org_id)
    return [
        OrgMemberOut(
            user_id=member.user_id,
            email=u.email,
            role=u.role,
            membership_role=member.membership_role,
            joined_at=member.joined_at,
        )
        for member, u in rows
    ]


@router.post(
    "/{org_id}/prototype-deliveries",
    response_model=list[PrototypeDeliveryOut],
    status_code=status.HTTP_201_CREATED,
)
def create_prototype_deliveries(
    org_id: uuid.UUID,
    body: PrototypeDeliveryCreate,
    user: Annotated[User, Depends(require_permission("prototype:send"))],
    db: Annotated[Session, Depends(get_db)],
) -> list[PrototypeDeliveryOut]:
    try:
        deliveries = send_prototype_deliveries(
            db,
            org_id=org_id,
            sender=user,
            conversation_id=body.conversation_id,
            recipient_ids=body.recipient_user_ids,
            title=body.title,
            message=body.message,
        )
    except DeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return [_delivery_out(db, item) for item in deliveries]


@router.get("/{org_id}/prototype-deliveries/inbox", response_model=list[PrototypeDeliveryOut])
def get_prototype_inbox(
    org_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("prototype:receive"))],
    db: Annotated[Session, Depends(get_db)],
) -> list[PrototypeDeliveryOut]:
    deliveries = list_inbox(db, user, org_id)
    return [_delivery_out(db, item) for item in deliveries]


@router.get("/{org_id}/prototype-deliveries/sent", response_model=list[PrototypeDeliveryOut])
def get_prototype_sent(
    org_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("prototype:send"))],
    db: Annotated[Session, Depends(get_db)],
) -> list[PrototypeDeliveryOut]:
    deliveries = list_sent(db, user, org_id)
    return [_delivery_out(db, item) for item in deliveries]


@router.get("/{org_id}/prototype-deliveries/{delivery_id}", response_model=PrototypeDeliveryOut)
def get_prototype_delivery(
    org_id: uuid.UUID,
    delivery_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("org:read"))],
    db: Annotated[Session, Depends(get_db)],
) -> PrototypeDeliveryOut:
    try:
        delivery = get_delivery_for_user(db, user, org_id, delivery_id)
    except DeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _delivery_out(db, delivery)


@router.post(
    "/{org_id}/prototype-deliveries/{delivery_id}/read",
    response_model=PrototypeDeliveryOut,
)
def read_prototype_delivery(
    org_id: uuid.UUID,
    delivery_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("prototype:receive"))],
    db: Annotated[Session, Depends(get_db)],
) -> PrototypeDeliveryOut:
    try:
        delivery = mark_delivery_read(db, user, org_id, delivery_id)
    except DeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _delivery_out(db, delivery)


@router.post(
    "/{org_id}/prototype-deliveries/{delivery_id}/analyze-stack",
    response_model=AnalyzeStackResponse,
)
def analyze_delivery_stack(
    org_id: uuid.UUID,
    delivery_id: uuid.UUID,
    body: AnalyzeStackRequest,
    user: Annotated[User, Depends(require_permission("dev:write_code"))],
    db: Annotated[Session, Depends(get_db)],
) -> AnalyzeStackResponse:
    try:
        get_delivery_for_user(db, user, org_id, delivery_id)
    except DeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    requirements_hint = ""
    try:
        requirements_hint = read_delivery_file(delivery_id, "REQUIREMENTS.md")
    except DeliveryError:
        pass
    recommendation, used_llm = analyze_stack(
        prompt=body.prompt,
        requirements_hint=requirements_hint[:4000],
    )
    return AnalyzeStackResponse(recommendation=recommendation, used_llm=used_llm)


@router.post(
    "/{org_id}/prototype-deliveries/{delivery_id}/dev-project",
    response_model=DevProjectBootstrapOut,
)
def create_dev_project_from_delivery(
    org_id: uuid.UUID,
    delivery_id: uuid.UUID,
    body: DevProjectBootstrapCreate,
    response: Response,
    user: Annotated[User, Depends(require_permission("dev:write_code"))],
    db: Annotated[Session, Depends(get_db)],
) -> DevProjectBootstrapOut:
    try:
        project, conversation, created, files_imported = bootstrap_dev_project_from_delivery(
            db,
            org_id=org_id,
            delivery_id=delivery_id,
            developer=user,
            title=body.title,
            mode=body.mode,
            prompt=body.prompt,
            stack=body.stack,
            source_path=body.source_path,
        )
    except DeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except DevProjectError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    response.status_code = (
        status.HTTP_201_CREATED if created else status.HTTP_200_OK
    )
    origin_mode = body.mode if created else "import"
    stack_id = body.stack.stack_id if body.stack else None
    return DevProjectBootstrapOut(
        project_id=project.id,
        conversation_id=conversation.id,
        created=created,
        delivery_id=delivery_id,
        origin_mode=origin_mode,
        stack_id=stack_id,
        files_imported=files_imported,
    )


@router.get("/{org_id}/prototype-deliveries/{delivery_id}/files/content", response_model=DeliveryFileOut)
def get_delivery_file_content(
    org_id: uuid.UUID,
    delivery_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("org:read"))],
    db: Annotated[Session, Depends(get_db)],
    path: Annotated[str, Query(min_length=1, max_length=64)],
) -> DeliveryFileOut:
    try:
        get_delivery_for_user(db, user, org_id, delivery_id)
        content = read_delivery_file(delivery_id, path)
    except DeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return DeliveryFileOut(path=path, content=content)
