import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Game, GameProgress, Mission, MissionCompletions

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="tester",
        email="tester@example.com",
        password="senha123",
        role="user",
    )


@pytest.fixture
def other_user(db):
    return User.objects.create_user(
        username="other",
        email="other@example.com",
        password="senha123",
        role="user",
    )


@pytest.fixture
def authenticated_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def game(db):
    return Game.objects.create(
        name="Game Teste",
        description="Descricao",
        category="Categoria",
    )


@pytest.mark.django_db
class TestGameProgressCreate:
    def test_create_progress_success(self, authenticated_client, game):
        response = authenticated_client.post(
            "/auth/progress/",
            {"game": game.id, "progress_percentage": 0},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["game"] == game.id
        assert response.data["game_name"] == game.name
        assert response.data["progress_percentage"] == 0
        assert response.data["completed_at"] is None

    def test_create_duplicate_returns_existing(self, authenticated_client, game):
        first = authenticated_client.post("/auth/progress/", {"game": game.id}, format="json")
        assert first.status_code == status.HTTP_201_CREATED

        second = authenticated_client.post(
            "/auth/progress/",
            {"game": game.id, "progress_percentage": 55},
            format="json",
        )

        assert second.status_code == status.HTTP_200_OK
        assert second.data["progress"]["id"] == first.data["id"]
        assert second.data["progress"]["progress_percentage"] == first.data["progress_percentage"]

    def test_create_progress_unauthenticated(self, api_client, game):
        response = api_client.post(
            "/auth/progress/",
            {"game": game.id, "progress_percentage": 10},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestGameProgressListAndUpdate:
    def test_list_only_own_progress_and_filter_by_game_id(
        self,
        authenticated_client,
        user,
        other_user,
    ):
        game_1 = Game.objects.create(name="Game 1")
        game_2 = Game.objects.create(name="Game 2")

        own_progress_1 = GameProgress.objects.create(
            user=user,
            game=game_1,
            progress_percentage=20,
        )
        GameProgress.objects.create(
            user=user,
            game=game_2,
            progress_percentage=80,
        )
        GameProgress.objects.create(
            user=other_user,
            game=game_1,
            progress_percentage=90,
        )

        response_all = authenticated_client.get("/auth/progress/list/")
        assert response_all.status_code == status.HTTP_200_OK
        assert len(response_all.data) == 2

        response_filtered = authenticated_client.get(
            f"/auth/progress/list/?game_id={game_1.id}"
        )
        assert response_filtered.status_code == status.HTTP_200_OK
        assert len(response_filtered.data) == 1
        assert response_filtered.data[0]["id"] == own_progress_1.id

    def test_patch_progress_to_100_sets_completed_at(self, authenticated_client, user, game):
        progress = GameProgress.objects.create(
            user=user,
            game=game,
            progress_percentage=90,
        )

        response = authenticated_client.patch(
            f"/auth/progress/{progress.id}/",
            {"progress_percentage": 100},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["progress_percentage"] == 100
        assert response.data["completed_at"] is not None

    def test_patch_completed_progress_with_100_returns_error(
        self,
        authenticated_client,
        user,
        game,
    ):
        progress = GameProgress.objects.create(
            user=user,
            game=game,
            progress_percentage=100,
            completed_at=timezone.now(),
        )

        response = authenticated_client.patch(
            f"/auth/progress/{progress.id}/",
            {"progress_percentage": 100},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "error" in response.data

    def test_patch_other_user_progress_returns_404(
        self,
        authenticated_client,
        other_user,
        game,
    ):
        progress = GameProgress.objects.create(
            user=other_user,
            game=game,
            progress_percentage=40,
        )

        response = authenticated_client.patch(
            f"/auth/progress/{progress.id}/",
            {"progress_percentage": 60},
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestProgressSummaryAndStats:
    def test_progress_summary_with_data(self, authenticated_client, user):
        game_in_progress = Game.objects.create(name="Game andamento")
        game_completed = Game.objects.create(name="Game concluido")

        GameProgress.objects.create(
            user=user,
            game=game_in_progress,
            progress_percentage=40,
            completed_at=None,
        )
        GameProgress.objects.create(
            user=user,
            game=game_completed,
            progress_percentage=100,
            completed_at=timezone.now(),
        )

        mission = Mission.objects.create(
            game=game_completed,
            title="Missao",
            description="Descricao",
            mission_type="reading",
            icon="book",
            order=1,
            points_value=120,
            content_data={"text": "conteudo"},
            is_active=True,
        )
        MissionCompletions.objects.create(
            user=user,
            mission=mission,
            status="completed",
            points_earned=120,
        )

        summary_response = authenticated_client.get("/auth/progress/summary/")
        assert summary_response.status_code == status.HTTP_200_OK
        assert summary_response.data["courses_in_progress"] == 1
        assert summary_response.data["courses_completed"] == 1
        assert summary_response.data["missions_completed"] == 1
        assert summary_response.data["total_points"] == 120

    def test_user_stats_returns_expected_shape(self, authenticated_client, user):
        game = Game.objects.create(name="Game stats")
        mission = Mission.objects.create(
            game=game,
            title="Missao Stats",
            description="Descricao",
            mission_type="reading",
            icon="book",
            order=1,
            points_value=200,
            content_data={"text": "conteudo"},
            is_active=True,
        )
        MissionCompletions.objects.create(
            user=user,
            mission=mission,
            status="completed",
            points_earned=200,
        )

        response = authenticated_client.get("/auth/me/stats/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_xp"] == 200
        assert response.data["games_completed"] >= 0
        assert "level" in response.data
        assert "xp" in response.data
        assert "xpToNext" in response.data
        assert "games_required_for_next" in response.data
        assert "is_next_level_locked" in response.data
