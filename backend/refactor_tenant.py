import os
import re
import shutil

api_dir = 'app/api'
svc_dir = 'app/services'

# Create backup
if not os.path.exists('backup_api'):
    shutil.copytree(api_dir, 'backup_api')
if not os.path.exists('backup_services'):
    shutil.copytree(svc_dir, 'backup_services')

# Refactor services
for f in os.listdir(svc_dir):
    if not f.endswith('.py') or f in ['admin_service.py', 'auth_service.py', 'company_service.py', 'import_service.py']: continue
    path = os.path.join(svc_dir, f)
    with open(path, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # 1. Replace parameter names user_id -> company_id in function defs
    content = re.sub(r'user_id\s*:\s*uuid\.UUID', 'company_id: uuid.UUID', content)
    
    # 2. Replace Model.user_id with Model.company_id
    content = re.sub(r'\.user_id\b', '.company_id', content)
    
    # 3. Replace isolated user_id variable usages with company_id
    content = re.sub(r'\buser_id\b', 'company_id', content)
    
    # Revert 'created_by_company_id' -> 'created_by_user_id'
    content = content.replace('created_by_company_id', 'created_by_user_id')
    
    with open(path, 'w', encoding='utf-8') as file:
        file.write(content)

# Refactor API
for f in os.listdir(api_dir):
    if not f.endswith('.py') or f in ['admin.py', 'auth.py', 'companies.py', 'two_factor.py', 'users.py', 'export.py']: continue
    path = os.path.join(api_dir, f)
    with open(path, 'r', encoding='utf-8') as file:
        content = file.read()
        
    # Add imports
    if 'get_current_company' not in content:
        content = content.replace('from app.core.auth import current_active_user', 
                                  'from app.core.auth import current_active_user\nfrom app.core.tenant import get_current_company\nfrom app.models.company import Company')

    # Replace route definitions
    content = re.sub(r'(user:\s*User\s*=\s*Depends\(current_active_user\),?)', 
                     r'\1\n    company: Company = Depends(get_current_company),', content)
                     
    # Replace passing user.id to passing company.id in service calls
    content = content.replace('user.id', 'company.id')
    
    # Revert user.id cases where it wasn't the company.id parameter (for example created_by_user_id)
    # create_category passes user.id as well?
    # Wait, in category_service.py, I renamed user_id to company_id.
    # So category_service.create_category(session, company.id, data) is correct!
    
    with open(path, 'w', encoding='utf-8') as file:
        file.write(content)

print('Refactoring script executed successfully!')
