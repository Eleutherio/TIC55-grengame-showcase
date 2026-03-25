from django.core.management.base import BaseCommand

from core.temporary_access import purge_expired_temporary_accounts


class Command(BaseCommand):
    help = "Remove contas temporarias expiradas e dados associados."

    def handle(self, *args, **options):
        deleted_count = purge_expired_temporary_accounts()
        self.stdout.write(
            self.style.SUCCESS(
                f"Cleanup finalizado. Registros removidos: {deleted_count}"
            )
        )
