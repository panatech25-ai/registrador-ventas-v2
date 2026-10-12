const https = require('https');

// Cache en memoria para metadatos de productos de Panatech
let metadataPanatechCache = null;
let ultimaCargaMetadata = 0;

function fetchPage(url, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8'
            },
            timeout: timeoutMs
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // Redirección
                return fetchPage(res.headers.location, timeoutMs).then(resolve).catch(reject);
            }
            if (res.statusCode >= 400) {
                return reject(new Error(`HTTP ${res.statusCode} en ${url}`));
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Timeout al conectar con ${url}`));
        });

        req.on('error', reject);
    });
}

function decodeHtmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&#039;/g, "'")
        .replace(/&aacute;/g, 'á')
        .replace(/&eacute;/g, 'é')
        .replace(/&iacute;/g, 'í')
        .replace(/&oacute;/g, 'ó')
        .replace(/&uacute;/g, 'ú')
        .replace(/&ntilde;/g, 'ñ')
        .replace(/&Aacute;/g, 'Á')
        .replace(/&Eacute;/g, 'É')
        .replace(/&Iacute;/g, 'Í')
        .replace(/&Oacute;/g, 'Ó')
        .replace(/&Uacute;/g, 'Ú')
        .replace(/&Ntilde;/g, 'Ñ');
}

function normalizeName(str) {
    return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseProductsFromHtml(html) {
    const products = [];
    const itemRegex = /<div[^>]*class="[^"]*js-product-item-private[^"]*"[^>]*data-product-id="(\d+)"([\s\S]*?)<\/script>\s*<\/div>/g;
    let match;

    while ((match = itemRegex.exec(html)) !== null) {
        const productId = match[1];
        const blockHtml = match[2];

        try {
            const jsonLdMatch = blockHtml.match(/<script type="application\/ld\+json" data-component='structured-data\.item'>([\s\S]*?)$/);
            let json = {};
            if (jsonLdMatch) {
                try {
                    json = JSON.parse(jsonLdMatch[1].trim());
                } catch (e) {
                    // Fallback
                }
            }

            const name = decodeHtmlEntities(json.name || '');
            if (!name) continue;

            const image = json.image || '';
            const url = json.mainEntityOfPage ? (json.mainEntityOfPage['@id'] || json.mainEntityOfPage) : '';
            const offers = json.offers || {};
            const regularPrice = parseFloat(offers.price) || 0;

            let stock = 0;
            if (offers.inventoryLevel && offers.inventoryLevel.value !== undefined) {
                stock = parseInt(offers.inventoryLevel.value, 10) || 0;
            } else if (offers.availability && offers.availability.includes('InStock')) {
                stock = 1;
            }

            let precioEfectivo = regularPrice;
            const rawPriceMatch = blockHtml.match(/data-priceraw-without-shipping="(\d+)"/);
            if (rawPriceMatch) {
                precioEfectivo = parseInt(rawPriceMatch[1], 10) / 100;
            } else {
                const discountMatch = blockHtml.match(/js-payment-discount-price-product[^>]*>[\s\r\n]*\$?([\d.,]+)/);
                if (discountMatch) {
                    const clean = discountMatch[1].replace(/\./g, '').replace(',', '.');
                    precioEfectivo = parseFloat(clean) || regularPrice;
                }
            }

            // Si tiene etiqueta explícita visible "Sin stock", forzar 0
            if (blockHtml.includes('data-label="Sin stock"') &&
                !blockHtml.includes('data-label="Sin stock" style="display:none;"') &&
                !blockHtml.includes('data-label="Sin stock" style="display: none;"')) {
                stock = 0;
            }

            products.push({
                productId,
                name,
                image,
                url,
                precioLista: regularPrice,
                precioEfectivo,
                stock
            });
        } catch (err) {
            console.error(`Error parseando producto ${productId}:`, err.message);
        }
    }

    return products;
}

// Scrapea todas las páginas disponibles de https://panatech.com.ar/productos/
async function scrapePanatechProductos() {
    const allProducts = [];
    const baseUrl = 'https://panatech.com.ar/productos/';
    let page = 1;
    let maxPages = 10; // límite de seguridad

    while (page <= maxPages) {
        const pageUrl = page === 1 ? baseUrl : `${baseUrl}page/${page}/`;
        try {
            console.log(`[Scraper Panatech] Descargando página ${page}: ${pageUrl}`);
            const html = await fetchPage(pageUrl);
            const prods = parseProductsFromHtml(html);

            if (!prods || prods.length === 0) {
                console.log(`[Scraper Panatech] Fin de páginas en página ${page} (0 productos encontrados)`);
                break;
            }

            allProducts.push(...prods);
            console.log(`[Scraper Panatech] Página ${page}: ${prods.length} productos obtenidos (total acumulado: ${allProducts.length})`);

            // Verificar si hay página siguiente inspeccionando la paginación
            const nextPagePattern = new RegExp(`href=["']/productos/page/${page + 1}/["']`);
            if (!nextPagePattern.test(html)) {
                console.log(`[Scraper Panatech] No se encontró enlace a página ${page + 1}. Fin del scrapeo.`);
                break;
            }

            page++;
        } catch (err) {
            console.warn(`[Scraper Panatech] Error o fin al descargar página ${page}:`, err.message);
            break;
        }
    }

    return allProducts;
}

const fs = require('fs');
const path = require('path');
const METADATA_LOCAL_FILE = path.join(__dirname, 'panatech_metadata_cache.json');

// Helper para obtener metadatos guardados en Supabase o cache local
async function obtenerMetadataPanatech(supabase) {
    const ahora = Date.now();
    if (metadataPanatechCache && ahora - ultimaCargaMetadata < 30000) {
        return metadataPanatechCache;
    }

    try {
        const { data, error } = await supabase
            .from('ordenes')
            .select('observaciones')
            .eq('numero_orden', 'SYS_CONFIG_PRODUCTOS_METADATA_PANATECH')
            .maybeSingle();

        if (error) {
            console.error('[Scraper Panatech] Error al leer metadata de Supabase:', error.message);
        }

        if (data && data.observaciones) {
            const parsed = JSON.parse(data.observaciones);
            if (parsed && typeof parsed === 'object') {
                metadataPanatechCache = parsed;
                ultimaCargaMetadata = ahora;
                return metadataPanatechCache;
            }
        }
    } catch (err) {
        console.error('[Scraper Panatech] Error al parsear metadata de Supabase:', err);
    }

    // Fallback de archivo local si existe
    if (fs.existsSync(METADATA_LOCAL_FILE)) {
        try {
            const raw = fs.readFileSync(METADATA_LOCAL_FILE, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                metadataPanatechCache = parsed;
                ultimaCargaMetadata = ahora;
                return metadataPanatechCache;
            }
        } catch (e) {
            // Ignorar
        }
    }

    metadataPanatechCache = {};
    ultimaCargaMetadata = ahora;
    return metadataPanatechCache;
}

// Helper para persistir metadatos en Supabase y localmente
async function guardarMetadataPanatech(supabase, metadata) {
    metadataPanatechCache = metadata;
    ultimaCargaMetadata = Date.now();
    const jsonStr = JSON.stringify(metadata);

    // Guardar en archivo local
    try {
        fs.writeFileSync(METADATA_LOCAL_FILE, jsonStr, 'utf-8');
    } catch (e) {
        // En entornos serverless read-only se ignora error de escritura local
    }

    try {
        const { data: existente } = await supabase
            .from('ordenes')
            .select('id')
            .eq('numero_orden', 'SYS_CONFIG_PRODUCTOS_METADATA_PANATECH')
            .maybeSingle();

        if (existente && existente.id) {
            const { error: updateErr } = await supabase
                .from('ordenes')
                .update({ observaciones: jsonStr })
                .eq('id', existente.id);
            if (updateErr) console.error('[Scraper Panatech] Error al actualizar metadata en Supabase:', updateErr.message);
        } else {
            const { error: insertErr } = await supabase
                .from('ordenes')
                .insert([{
                    numero_orden: 'SYS_CONFIG_PRODUCTOS_METADATA_PANATECH',
                    vendedor: 'sistema',
                    cliente_nombre: 'Metadata Productos Panatech',
                    total: 0,
                    estado: 'Cancelado',
                    observaciones: jsonStr
                }]);
            if (insertErr) console.error('[Scraper Panatech] Error al insertar metadata en Supabase:', insertErr.message);
        }
    } catch (err) {
        console.error('[Scraper Panatech] Error al guardar metadata en Supabase:', err);
    }
}

// Función principal de Sincronización y Unificación
async function sincronizarProductosPanatech(supabase) {
    const inicio = Date.now();
    console.log('[Scraper Panatech] Iniciando sincronización completa...');

    // 1. Scrapear la tienda online
    const scraped = await scrapePanatechProductos();
    if (!scraped || scraped.length === 0) {
        throw new Error('No se pudieron obtener productos de la tienda online panatech.com.ar');
    }

    // 2. Traer productos de Panatech de la base de datos
    const { data: dbProds, error: dbErr } = await supabase
        .from('productos')
        .select('*')
        .eq('marca', 'panatech');

    if (dbErr) throw dbErr;

    // 3. Traer metadatos previos
    const metadata = await obtenerMetadataPanatech(supabase);

    // Obtener qué productos tienen ventas registradas en orden_detalles
    const allDbIds = (dbProds || []).map(p => p.id);
    let idsConVentas = new Set();
    if (allDbIds.length > 0) {
        try {
            const { data: ventasRef } = await supabase
                .from('orden_detalles')
                .select('producto_id')
                .in('producto_id', allDbIds);
            if (ventasRef) {
                idsConVentas = new Set(ventasRef.map(v => v.producto_id));
            }
        } catch (e) {
            console.warn('[Scraper Panatech] No se pudo verificar orden_detalles:', e.message);
        }
    }

    // Agrupar en DB por nombre normalizado para unificación
    const productosPorNombre = new Map();
    for (const p of (dbProds || [])) {
        const norm = normalizeName(p.nombre);
        if (!productosPorNombre.has(norm)) {
            productosPorNombre.set(norm, []);
        }
        productosPorNombre.get(norm).push(p);
    }

    let actualizados = 0;
    let nuevos = 0;
    let sinCambios = 0;
    let duplicadosUnificados = 0;

    // 4. Iterar sobre los productos scrapeados y unificar
    for (const sp of scraped) {
        const sNorm = normalizeName(sp.name);

        // Buscar coincidencias en la DB
        let listaCoincidentes = productosPorNombre.get(sNorm);
        if (!listaCoincidentes || listaCoincidentes.length === 0) {
            // Match parcial si longitud > 8
            for (const [nKey, list] of productosPorNombre.entries()) {
                if (nKey.length > 8 && sNorm.length > 8 && (nKey.includes(sNorm) || sNorm.includes(nKey))) {
                    listaCoincidentes = list;
                    break;
                }
            }
        }

        if (listaCoincidentes && listaCoincidentes.length > 0) {
            // El producto ya existe en la DB. Unificamos si hay duplicados:
            // Elegir producto principal: preferir el que tiene ventas en orden_detalles, o el menor ID
            listaCoincidentes.sort((a, b) => {
                const aVentas = idsConVentas.has(a.id) ? 1 : 0;
                const bVentas = idsConVentas.has(b.id) ? 1 : 0;
                if (aVentas !== bVentas) return bVentas - aVentas;
                return a.id - b.id;
            });

            const principal = listaCoincidentes[0];
            const duplicadosSecundarios = listaCoincidentes.slice(1);

            // Actualizar producto principal con precio efectivo y stock de la web
            const precioDifiere = Math.abs(principal.precio - sp.precioEfectivo) > 0.01;
            const stockDifiere = principal.stock !== sp.stock;

            if (precioDifiere || stockDifiere) {
                await supabase
                    .from('productos')
                    .update({
                        precio: sp.precioEfectivo,
                        stock: sp.stock
                    })
                    .eq('id', principal.id);
                actualizados++;
            } else {
                sinCambios++;
            }

            // Guardar metadata del producto principal
            metadata[principal.id] = {
                productId: sp.productId,
                imagen_url: sp.image || '/img/no-image.svg',
                url_tienda: sp.url,
                precio_lista: sp.precioLista,
                precio_efectivo: sp.precioEfectivo,
                synced_web: true,
                ultima_sync: new Date().toISOString()
            };

            // Tratar duplicados secundarios
            for (const dup of duplicadosSecundarios) {
                duplicadosUnificados++;
                metadata[dup.id] = {
                    productId: sp.productId,
                    imagen_url: sp.image || '/img/no-image.svg',
                    url_tienda: sp.url,
                    precio_lista: sp.precioLista,
                    precio_efectivo: sp.precioEfectivo,
                    synced_web: true,
                    es_duplicado: true,
                    ultima_sync: new Date().toISOString()
                };

                if (!idsConVentas.has(dup.id)) {
                    // Si no está en órdenes históricas, eliminarlo para limpiar la base de datos
                    try {
                        await supabase.from('productos').delete().eq('id', dup.id);
                    } catch (e) {
                        await supabase.from('productos').update({ stock: 0 }).eq('id', dup.id);
                    }
                } else {
                    // Si tiene ventas pasadas, dejar su stock en 0 para no romper el historial
                    if (dup.stock !== 0) {
                        await supabase.from('productos').update({ stock: 0 }).eq('id', dup.id);
                    }
                }
            }
        } else {
            // Producto NUEVO en el sistema: insertarlo
            const nuevoSku = `PAN-W-${sp.productId.slice(-5)}`;
            const { data: inserted, error: insertErr } = await supabase
                .from('productos')
                .insert([{
                    codigo_sku: nuevoSku,
                    nombre: sp.name,
                    variante: 'Única',
                    precio: sp.precioEfectivo,
                    stock: sp.stock,
                    marca: 'panatech'
                }])
                .select()
                .single();

            if (!insertErr && inserted) {
                nuevos++;
                metadata[inserted.id] = {
                    productId: sp.productId,
                    imagen_url: sp.image || '/img/no-image.svg',
                    url_tienda: sp.url,
                    precio_lista: sp.precioLista,
                    precio_efectivo: sp.precioEfectivo,
                    synced_web: true,
                    ultima_sync: new Date().toISOString()
                };
                productosPorNombre.set(sNorm, [inserted]);
            }
        }
    }

    // 5. Para los productos que están en el sistema pero NO estaban en la web:
    // Se mantienen intactos y nos aseguramos de que tengan la imagen genérica
    for (const dp of dbProds) {
        if (!metadata[dp.id]) {
            metadata[dp.id] = {
                imagen_url: '/img/no-image.svg',
                url_tienda: null,
                precio_lista: dp.precio,
                precio_efectivo: dp.precio,
                synced_web: false,
                ultima_sync: null
            };
        }
    }

    // Guardar resumen general en metadata
    metadata._info = {
        ultima_sincronizacion: new Date().toISOString(),
        total_web: scraped.length,
        actualizados,
        nuevos,
        sinCambios,
        duracion_ms: Date.now() - inicio
    };

    await guardarMetadataPanatech(supabase, metadata);

    console.log(`[Scraper Panatech] Sincronización finalizada en ${Date.now() - inicio}ms:`, metadata._info);

    return {
        success: true,
        totalWeb: scraped.length,
        actualizados,
        nuevos,
        sinCambios,
        duracionMs: Date.now() - inicio,
        fecha: metadata._info.ultima_sincronizacion
    };
}

module.exports = {
    scrapePanatechProductos,
    sincronizarProductosPanatech,
    obtenerMetadataPanatech,
    guardarMetadataPanatech,
    normalizeName
};
