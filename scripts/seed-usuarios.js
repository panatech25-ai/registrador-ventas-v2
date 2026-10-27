/**
 * Script de inicialización y migración de contraseñas con bcrypt
 * Uso: node scripts/seed-usuarios.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_KEY || '').trim();

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Variables SUPABASE_URL o SUPABASE_KEY faltantes en .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('Verificando usuarios en Supabase...');
    const { data, error } = await supabase
        .from('ordenes')
        .select('id, observaciones')
        .eq('numero_orden', 'SYS_CONFIG_USUARIOS')
        .maybeSingle();

    if (error) {
        console.error('Error al consultar Supabase:', error.message);
        process.exit(1);
    }

    if (!data || !data.observaciones) {
        console.log('No se encontró configuración de usuarios en SYS_CONFIG_USUARIOS.');
        process.exit(0);
    }

    let usuarios = [];
    try {
        usuarios = JSON.parse(data.observaciones);
    } catch (e) {
        console.error('Error al parsear JSON de usuarios:', e.message);
        process.exit(1);
    }

    let actualizados = 0;
    for (const u of usuarios) {
        const esBcrypt = u.password && (u.password.startsWith('$2a$') || u.password.startsWith('$2b$'));
        if (!esBcrypt && u.password) {
            console.log(`Hasheando contraseña en texto plano para usuario: ${u.username}`);
            u.password = bcrypt.hashSync(u.password, 10);
            actualizados++;
        } else {
            console.log(`Usuario ${u.username}: contraseña ya protegida con bcrypt.`);
        }
    }

    if (actualizados > 0) {
        const { error: updErr } = await supabase
            .from('ordenes')
            .update({ observaciones: JSON.stringify(usuarios) })
            .eq('id', data.id);

        if (updErr) {
            console.error('Error al guardar usuarios:', updErr.message);
            process.exit(1);
        }
        console.log(`Se actualizaron ${actualizados} usuarios a hash bcrypt exitosamente.`);
    } else {
        console.log('Todos los usuarios ya cuentan con contraseñas seguras (bcrypt).');
    }
}

main();
