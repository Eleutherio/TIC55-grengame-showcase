import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Game, Mission, MissionCompletions


User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def create_user(db):
    def make_user(email="test@example.com", password="senha123", role="user"):
        username = email.split("@")[0]
        return User.objects.create_user(
            username=username,
            email=email,
            password=password,
            role=role,
            first_name="Test",
            last_name="User",
        )

    return make_user


@pytest.fixture
def create_admin(create_user):
    def make_admin(email="admin@example.com"):
        return create_user(email=email, role="admin")

    return make_admin


@pytest.fixture
def authenticated_client(api_client, create_user):
    def _authenticated_client(user=None):
        current_user = user or create_user()
        client = APIClient()
        client.force_authenticate(user=current_user)
        return client, current_user

    return _authenticated_client


@pytest.fixture
def create_game(db):
    def make_game(name="Game Teste", category="Categoria"):
        return Game.objects.create(
            name=name,
            description="Descricao",
            category=category,
            is_active=True,
        )

    return make_game


@pytest.fixture
def create_mission(db, create_game):
    def make_mission(
        *,
        game=None,
        title="Missao Teste",
        points_value=100,
        mission_type="quiz",
        order=1,
        is_active=True,
        content_data=None,
    ):
        target_game = game or create_game()

        if content_data is None:
            if mission_type == "quiz":
                content_data = {
                    "questions": [
                        {
                            "id": 1,
                            "question": "Pergunta 1?",
                            "options": ["A", "B"],
                            "correct_answer": 0,
                        }
                    ]
                }
            elif mission_type == "game":
                content_data = {"word": "CICLO", "max_attempts": 6}
            elif mission_type == "video":
                content_data = {"url": "https://example.com/video.mp4"}
            else:
                content_data = {"text": "Conteudo"}

        return Mission.objects.create(
            game=target_game,
            title=title,
            description="Descricao",
            mission_type=mission_type,
            order=order,
            points_value=points_value,
            content_data=content_data,
            is_active=is_active,
        )

    return make_mission


@pytest.mark.django_db
def test_admin_can_create_mission(authenticated_client, create_admin, create_game):
    admin = create_admin()
    client, _ = authenticated_client(user=admin)
    game = create_game()

    response = client.post(
        "/auth/missoes/",
        {
            "game": game.id,
            "title": "Nova Missao",
            "description": "Descricao",
            "mission_type": "reading",
            "order": 1,
            "points_value": 50,
            "is_active": True,
            "content_data": {"text": "Conteudo"},
        },
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["title"] == "Nova Missao"
    assert response.data["points_value"] == 50


@pytest.mark.django_db
def test_user_cannot_create_mission(authenticated_client, create_game):
    client, _ = authenticated_client()
    game = create_game()

    response = client.post(
        "/auth/missoes/",
        {
            "game": game.id,
            "title": "Nova Missao",
            "description": "Descricao",
            "mission_type": "reading",
            "order": 1,
            "points_value": 50,
            "is_active": True,
            "content_data": {"text": "Conteudo"},
        },
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_admin_can_update_mission(authenticated_client, create_admin, create_mission):
    admin = create_admin()
    mission = create_mission()
    client, _ = authenticated_client(user=admin)

    response = client.patch(
        f"/auth/missoes/{mission.id}/",
        {
            "title": "Missao Atualizada",
            "points_value": 200,
            "mission_type": mission.mission_type,
            "content_data": mission.content_data,
            "is_active": mission.is_active,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["title"] == "Missao Atualizada"
    assert response.data["points_value"] == 200


@pytest.mark.django_db
def test_admin_can_delete_mission(authenticated_client, create_admin, create_mission):
    admin = create_admin()
    mission = create_mission()
    client, _ = authenticated_client(user=admin)

    response = client.delete(f"/auth/missoes/{mission.id}/")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not Mission.objects.filter(id=mission.id).exists()


@pytest.mark.django_db
def test_user_cannot_delete_mission(authenticated_client, create_mission):
    mission = create_mission()
    client, _ = authenticated_client()

    response = client.delete(f"/auth/missoes/{mission.id}/")

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_user_sees_only_active_missions(authenticated_client, create_mission):
    create_mission(title="Missao Ativa", order=1, is_active=True)
    create_mission(title="Missao Inativa", order=2, is_active=False)

    client, _ = authenticated_client()
    response = client.get("/auth/missoes/")

    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]["title"] == "Missao Ativa"


@pytest.mark.django_db
def test_admin_sees_all_missions(authenticated_client, create_admin, create_mission):
    create_mission(title="Missao Ativa", order=1, is_active=True)
    create_mission(title="Missao Inativa", order=2, is_active=False)

    admin = create_admin()
    client, _ = authenticated_client(user=admin)
    response = client.get("/auth/missoes/")

    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 2


@pytest.mark.django_db
def test_filter_missions_by_game_id(authenticated_client, create_game, create_mission):
    game_a = create_game(name="Game A")
    game_b = create_game(name="Game B")
    mission_a = create_mission(game=game_a, order=1, title="A")
    create_mission(game=game_b, order=1, title="B")

    client, _ = authenticated_client()
    response = client.get(f"/auth/missoes/?game_id={game_a.id}")

    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]["id"] == mission_a.id


@pytest.mark.django_db
def test_user_can_start_mission(authenticated_client, create_mission):
    mission = create_mission()
    client, user = authenticated_client()

    response = client.post(f"/auth/missoes/{mission.id}/iniciar/")

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["mission"] == mission.id
    assert response.data["status"] == "in_progress"
    assert MissionCompletions.objects.filter(user=user, mission=mission).exists()


@pytest.mark.django_db
def test_cannot_start_inactive_mission(authenticated_client, create_mission):
    mission = create_mission(is_active=False)
    client, _ = authenticated_client()

    response = client.post(f"/auth/missoes/{mission.id}/iniciar/")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "ativa" in response.data["error"].lower()


@pytest.mark.django_db
def test_cannot_start_mission_twice(authenticated_client, create_mission):
    mission = create_mission()
    client, _ = authenticated_client()

    first = client.post(f"/auth/missoes/{mission.id}/iniciar/")
    second = client.post(f"/auth/missoes/{mission.id}/iniciar/")

    assert first.status_code == status.HTTP_201_CREATED
    assert second.status_code == status.HTTP_400_BAD_REQUEST
    assert "iniciou" in second.data["error"].lower()


@pytest.mark.django_db
def test_user_can_complete_mission(authenticated_client, create_mission):
    mission = create_mission(points_value=150, mission_type="video", order=1)
    client, user = authenticated_client()
    client.post(f"/auth/missoes/{mission.id}/iniciar/")

    response = client.patch(f"/auth/missoes/{mission.id}/completar/")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["points_awarded"] == 150
    completion = MissionCompletions.objects.get(user=user, mission=mission)
    assert completion.status == "completed"
    assert completion.points_earned == 150


@pytest.mark.django_db
def test_cannot_complete_without_starting(authenticated_client, create_mission):
    mission = create_mission(mission_type="video")
    client, _ = authenticated_client()

    response = client.patch(f"/auth/missoes/{mission.id}/completar/")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "iniciou" in response.data["error"].lower()


@pytest.mark.django_db
def test_cannot_complete_mission_twice(authenticated_client, create_mission):
    mission = create_mission(points_value=100, mission_type="video")
    client, _ = authenticated_client()
    client.post(f"/auth/missoes/{mission.id}/iniciar/")

    first = client.patch(f"/auth/missoes/{mission.id}/completar/")
    second = client.patch(f"/auth/missoes/{mission.id}/completar/")

    assert first.status_code == status.HTTP_200_OK
    assert second.status_code == status.HTTP_400_BAD_REQUEST
    assert "completou" in second.data["error"].lower()


@pytest.mark.django_db
def test_cannot_complete_inactive_mission(authenticated_client, create_mission):
    mission = create_mission(mission_type="video")
    client, _ = authenticated_client()
    client.post(f"/auth/missoes/{mission.id}/iniciar/")

    mission.is_active = False
    mission.save(update_fields=["is_active"])

    response = client.patch(f"/auth/missoes/{mission.id}/completar/")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "mais ativa" in response.data["error"].lower()


@pytest.mark.django_db
def test_list_mission_completions_context(authenticated_client, create_mission, create_user):
    mission = create_mission(title="Missao 1", order=1)

    user1 = create_user(email="user1@example.com")
    client1, _ = authenticated_client(user=user1)
    client1.post(f"/auth/missoes/{mission.id}/iniciar/")

    user2 = create_user(email="user2@example.com")
    client2, _ = authenticated_client(user=user2)
    response2 = client2.get("/auth/missoes/minhas/")
    assert response2.status_code == status.HTTP_200_OK
    assert len(response2.data) == 1
    assert response2.data[0]["completion"] is None

    response1 = client1.get("/auth/missoes/minhas/")
    assert response1.status_code == status.HTTP_200_OK
    assert response1.data[0]["completion"]["completed"] is False


@pytest.mark.django_db
def test_mission_points_must_be_positive(authenticated_client, create_admin, create_game):
    admin = create_admin()
    client, _ = authenticated_client(user=admin)
    game = create_game()

    response = client.post(
        "/auth/missoes/",
        {
            "game": game.id,
            "title": "Missao Invalida",
            "description": "Descricao",
            "mission_type": "reading",
            "order": 1,
            "points_value": -50,
            "is_active": True,
            "content_data": {"text": "Conteudo"},
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_mission_type_must_be_valid(authenticated_client, create_admin, create_game):
    admin = create_admin()
    client, _ = authenticated_client(user=admin)
    game = create_game()

    response = client.post(
        "/auth/missoes/",
        {
            "game": game.id,
            "title": "Missao Invalida",
            "description": "Descricao",
            "mission_type": "invalido",
            "order": 1,
            "points_value": 100,
            "is_active": True,
            "content_data": {"text": "Conteudo"},
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_validate_quiz_all_correct_answers(authenticated_client, create_mission):
    mission = create_mission(
        mission_type="quiz",
        points_value=100,
        content_data={
            "questions": [
                {"id": 1, "question": "Q1", "options": ["A", "B"], "correct_answer": 1},
                {"id": 2, "question": "Q2", "options": ["A", "B"], "correct_answer": 0},
            ]
        },
    )
    client, _ = authenticated_client()
    client.post(f"/auth/missoes/{mission.id}/iniciar/")

    response = client.post(
        f"/auth/missoes/{mission.id}/validar/",
        {"answers": [1, 0]},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["success"] is True
    assert response.data["points_earned"] == 100
    assert response.data["status"] == "completed"
    assert response.data["correct_answers"] == 2
    assert response.data["total_questions"] == 2


@pytest.mark.django_db
def test_validate_quiz_partial_correct_answers(authenticated_client, create_mission):
    mission = create_mission(
        mission_type="quiz",
        points_value=100,
        content_data={
            "questions": [
                {"id": 1, "question": "Q1", "options": ["A", "B"], "correct_answer": 0},
                {"id": 2, "question": "Q2", "options": ["A", "B"], "correct_answer": 1},
                {"id": 3, "question": "Q3", "options": ["A", "B"], "correct_answer": 0},
                {"id": 4, "question": "Q4", "options": ["A", "B"], "correct_answer": 1},
            ]
        },
    )
    client, _ = authenticated_client()
    client.post(f"/auth/missoes/{mission.id}/iniciar/")

    response = client.post(
        f"/auth/missoes/{mission.id}/validar/",
        {"answers": [0, 1, 1, 0]},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["success"] is False
    assert response.data["points_earned"] == 50
    assert response.data["status"] == "completed"
    assert response.data["correct_answers"] == 2
    assert response.data["total_questions"] == 4


@pytest.mark.django_db
def test_validate_quiz_wrong_number_of_answers(authenticated_client, create_mission):
    mission = create_mission(
        mission_type="quiz",
        content_data={
            "questions": [
                {"id": 1, "question": "Q1", "options": ["A", "B"], "correct_answer": 0},
                {"id": 2, "question": "Q2", "options": ["A", "B"], "correct_answer": 1},
            ]
        },
    )
    client, _ = authenticated_client()
    client.post(f"/auth/missoes/{mission.id}/iniciar/")

    response = client.post(
        f"/auth/missoes/{mission.id}/validar/",
        {"answers": [0]},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "esperado 2 respostas" in response.data["error"].lower()


@pytest.mark.django_db
def test_validate_wordle_correct_word(authenticated_client, create_mission):
    mission = create_mission(
        mission_type="game",
        points_value=150,
        content_data={"word": "PRAIA", "max_attempts": 6},
    )
    client, _ = authenticated_client()
    client.post(f"/auth/missoes/{mission.id}/iniciar/")

    response = client.post(
        f"/auth/missoes/{mission.id}/validar/",
        {"word": "PRAIA"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["success"] is True
    assert response.data["points_earned"] == 150
    assert response.data["status"] == "completed"


@pytest.mark.django_db
def test_validate_wordle_incorrect_word(authenticated_client, create_mission):
    mission = create_mission(
        mission_type="game",
        points_value=150,
        content_data={"word": "PRAIA", "max_attempts": 6},
    )
    client, _ = authenticated_client()
    client.post(f"/auth/missoes/{mission.id}/iniciar/")

    response = client.post(
        f"/auth/missoes/{mission.id}/validar/",
        {"word": "TESTE"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["success"] is False
    assert response.data["points_earned"] == 0
    assert response.data["status"] == "in_progress"


@pytest.mark.django_db
def test_validate_wordle_case_insensitive(authenticated_client, create_mission):
    mission = create_mission(
        mission_type="game",
        points_value=150,
        content_data={"word": "PRAIA", "max_attempts": 6},
    )
    client, _ = authenticated_client()
    client.post(f"/auth/missoes/{mission.id}/iniciar/")

    response = client.post(
        f"/auth/missoes/{mission.id}/validar/",
        {"word": "praia"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["success"] is True
    assert response.data["points_earned"] == 150


@pytest.mark.django_db
def test_validate_mission_not_found(authenticated_client):
    client, _ = authenticated_client()
    response = client.post(
        "/auth/missoes/99999/validar/",
        {"answers": [0]},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "encontrada" in response.data["error"].lower()


@pytest.mark.django_db
def test_validate_mission_not_started(authenticated_client, create_mission):
    mission = create_mission(mission_type="quiz")
    client, _ = authenticated_client()

    response = client.post(
        f"/auth/missoes/{mission.id}/validar/",
        {"answers": [0]},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "iniciar" in response.data["error"].lower()


@pytest.mark.django_db
def test_validate_already_completed_mission(authenticated_client, create_mission):
    mission = create_mission(mission_type="quiz")
    client, user = authenticated_client()

    MissionCompletions.objects.create(
        user=user,
        mission=mission,
        status="completed",
        points_earned=100,
        completed_at=timezone.now(),
    )

    response = client.post(
        f"/auth/missoes/{mission.id}/validar/",
        {"answers": [0]},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "completou" in response.data["error"].lower()


@pytest.mark.django_db
def test_validate_quiz_without_questions(authenticated_client, create_mission):
    mission = create_mission(mission_type="quiz", content_data={"questions": []})
    client, _ = authenticated_client()
    client.post(f"/auth/missoes/{mission.id}/iniciar/")

    response = client.post(
        f"/auth/missoes/{mission.id}/validar/",
        {"answers": []},
        format="json",
    )

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert "sem perguntas" in response.data["error"].lower()


@pytest.mark.django_db
def test_validate_wordle_without_word(authenticated_client, create_mission):
    mission = create_mission(mission_type="game", content_data={"max_attempts": 6})
    client, _ = authenticated_client()
    client.post(f"/auth/missoes/{mission.id}/iniciar/")

    response = client.post(
        f"/auth/missoes/{mission.id}/validar/",
        {"word": "TESTE"},
        format="json",
    )

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert "configurada" in response.data["error"].lower()
