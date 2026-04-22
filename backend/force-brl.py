import os
dirs = ['app/models', 'app/schemas']
for d in dirs:
    for f in os.listdir(d):
        if not f.endswith('.py'): continue
        path = os.path.join(d, f)
        with open(path, 'r', encoding='utf-8') as file:
            content = file.read()
            
        new_content = content.replace('default="USD"', 'default="BRL"')
        new_content = new_content.replace("default='USD'", "default='BRL'")
        new_content = new_content.replace('currency: str = "USD"', 'currency: str = "BRL"')
        new_content = new_content.replace("currency: str = 'USD'", "currency: str = 'BRL'")
        new_content = new_content.replace('currency="USD"', 'currency="BRL"')
        
        if content != new_content:
            with open(path, 'w', encoding='utf-8') as file:
                file.write(new_content)
            print('Updated', path)
