import requests
import os

def send_password_reset_email(to_email, name, code):
    api_key = os.getenv('MAILERSEND_API_KEY')
    template_id = os.getenv('MAILERSEND_TEMPLATE_ID')
    from_email = os.getenv('MAILERSEND_FROM_EMAIL')
    
    response = requests.post(
        'https://api.mailersend.com/v1/email',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        },
        json={
            'from': {'email': from_email},
            'to': [{'email': to_email}],
            'subject': 'Código de recuperação de senha - GrenGame',
            'template_id': template_id,
            'personalization': [{
                'email': to_email,
                'data': {
                    'name': name,
                    'code': code
                }
            }]
        }
    )
    return response.status_code in [200, 202]
