import { copyFileSync, existsSync } from 'fs';
import { join } from 'path';

const root = process.cwd();

const files = [
  { src: 'backend/.env.example', dest: 'backend/.env' },
  { src: '.env.example', dest: '.env' }
];

console.log('--- Configurando arquivos de ambiente (.env) ---');

files.forEach(({ src, dest }) => {
  const srcPath = join(root, src);
  const destPath = join(root, dest);

  if (!existsSync(destPath)) {
    if (existsSync(srcPath)) {
      copyFileSync(srcPath, destPath);
      console.log(`✅ Criado: ${dest}`);
    } else {
      console.log(`⚠️  Aviso: ${src} não encontrado.`);
    }
  } else {
    console.log(`ℹ️  Já existe: ${dest}`);
  }
});

console.log('\n--- Próximos passos (Modo Supabase) ---');
console.log('1. Abra o arquivo "backend/.env" e cole sua URL do Supabase em DATABASE_URL.');
console.log('   Exemplo: DATABASE_URL=postgresql+asyncpg://postgres:senha@db.ref.supabase.co:5432/postgres');
console.log('2. Instale as dependências: npm run install:all');
console.log('3. Rode as migrações no Supabase: npm run migrate');
console.log('4. Inicie o projeto: npm run dev');
console.log('\nNota: O Redis não é obrigatório para rodar a API básica.');
