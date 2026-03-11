import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Game, Mission


User = get_user_model()


def create_admin_user():
    return User.objects.create_user(
        username="admin",
        email="admin@example.com",
        password="senha123",
        role="admin",
        first_name="Admin",
        last_name="User",
    )


@pytest.mark.django_db
def test_patch_updates_content_data_and_order():
    client = APIClient()
    admin = create_admin_user()
    client.force_authenticate(user=admin)

    game = Game.objects.create(
        name="Game Teste",
        description="Descricao teste",
        category="Categoria",
        is_active=True,
    )
    mission = Mission.objects.create(
        game=game,
        title="Missao Original",
        description="Descricao original",
        mission_type="quiz",
        order=1,
        points_value=100,
        is_active=True,
        content_data={
            "questions": [
                {
                    "id": 1,
                    "question": "Pergunta 1?",
                    "options": ["A", "B"],
                    "correct_answer": 0,
                }
            ]
        },
    )

    payload = {
        "order": 2,
        "content_data": {
            "questions": [
                {
                    "id": 1,
                    "question": "Pergunta atualizada?",
                    "options": ["A", "B"],
                    "correct_answer": 1,
                }
            ]
        },
    }

    response = client.patch(
        f"/auth/missoes/{mission.id}/",
        payload,
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["order"] == payload["order"]
    assert response.data["content_data"] == payload["content_data"]

    mission.refresh_from_db()
    assert mission.order == payload["order"]
    assert mission.content_data == payload["content_data"]
