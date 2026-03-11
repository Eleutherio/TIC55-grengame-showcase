def calculate_tier_progress(total_xp):
    """
        Regras:
    - Bronze: 0 a 499 XP
    - Prata: 500 a 999 XP
    - Ouro: 1000+ XP
    """
    if total_xp is None:
        total_xp = 0
    
    total_xp = max(0, int(total_xp))

    LIMIT_BRONZE = 500 
    LIMIT_SILVER = 1000

    if total_xp < LIMIT_BRONZE:
        xp_to_next = LIMIT_BRONZE - total_xp
        return {
            "level": "Bronze",
            "xp": total_xp,
            "xpToNext": xp_to_next,
            "total_xp": total_xp
        }
    
    elif total_xp < LIMIT_SILVER:
        xp_in_level = total_xp - LIMIT_BRONZE
        level_total = LIMIT_SILVER - LIMIT_BRONZE
        xp_to_next = level_total - xp_in_level
        return {
            "level": "Prata",
            "xp": xp_in_level,
            "xpToNext": xp_to_next,
            "total_xp": total_xp
        }
        
    else:
        
        return {
            "level": "Ouro",
            "xp": total_xp - LIMIT_SILVER, 
            "xpToNext": None, 
            "total_xp": total_xp
        }


def update_game_progress(user, game):
    from django.utils import timezone
    from .models import GameProgress, MissionCompletions
    
    # Buscar ou criar o progresso do game
    game_progress, created = GameProgress.objects.get_or_create(
        user=user,
        game=game,
        defaults={'progress_percentage': 0, 'game_points': 0}
    )
    
    # Contar total de missões ativas no game
    total_missions = game.missions.filter(is_active=True).count()
    
    if total_missions == 0:
        # Se não há missões, progresso é 0%
        game_progress.progress_percentage = 0
        game_progress.completed_at = None
        game_progress.save()
        return game_progress
    
    # Contar missões completadas pelo usuário neste game
    completed_missions = MissionCompletions.objects.filter(
        user=user,
        mission__game=game,
        mission__is_active=True,
        status='completed'
    ).count()
    
    # Calcular porcentagem de progresso
    progress_percentage = int((completed_missions / total_missions) * 100)
    game_progress.progress_percentage = progress_percentage
    
    # Se atingiu 100% e ainda não foi marcado como concluído, marcar
    if progress_percentage >= 100 and not game_progress.completed_at:
        game_progress.completed_at = timezone.now()
    # Se caiu abaixo de 100% (missão desativada, por exemplo), limpar conclusão
    elif progress_percentage < 100 and game_progress.completed_at:
        game_progress.completed_at = None
    
    game_progress.save()
    return game_progress
