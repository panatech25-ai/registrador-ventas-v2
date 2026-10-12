const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuración de marcas soportadas para sincronización con Tiendanube
const BRAND_CONFIGS = {
    panatech: {
        marca: 'panatech',
        baseUrl: 'https://panatech.com.ar/productos/',
        skuPrefix: 'PAN-W-',
        sysConfigOrderNum: 'SYS_CONFIG_PRODUCTOS_METADATA_PANATECH',
        sysConfigClientName: 'Metadata Productos Panatech',
        localCacheFile: path.join(__dirname, 'panatech_metadata_cache.json'),
        maxPages: 12
    },
    incanto: {
        marca: 'incanto',
        baseUrl: 'https://www.incantorosario.com.ar/productos/',
        skuPrefix: 'INC-W-',
        sysConfigOrderNum: 'SYS_CONFIG_PRODUCTOS_METADATA_INCANTO',
        sysConfigClientName: 'Metadata Productos Incanto',
        localCacheFile: path.join(__dirname, 'incanto_metadata_cache.json'),
        maxPages: 25
    }
};

// Cache en memoria por marca
const metadataMemoryCache = {
    panatech: { data: null, lastLoaded: 0 },
    incanto: { data: null, lastLoaded: 0 }
};

function fetchPage(url, timeoutMs = 15000) {
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
                let redirectUrl = res.headers.location;
                if (redirectUrl.startsWith('/')) {
                    const parsed = new URL(url);
                    redirectUrl = `${parsed.origin}${redirectUrl}`;
                }
                return fetchPage(redirectUrl, timeoutMs).then(resolve).catch(reject);
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
        .replace(/&rsquo;/g, "'")
        .replace(/&lsquo;/g, "'")
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

            const name = decodeHtmlEntities(json.name || '').trim();
            if (!name) continue;

            let image = json.image || '';
            if (image && image.startsWith('//')) {
                image = 'https:' + image;
            }
            const url = json.mainEntityOfPage ? (json.mainEntityOfPage['@id'] || json.mainEntityOfPage) : '';
            const offers = json.offers || {};

            // Precio de lista: obtener desde js-price-display si está disponible, o desde offers.price
            let regularPrice = parseFloat(offers.price) || 0;
            const displayPriceMatch = blockHtml.match(/js-price-display[^>]*>[\s\r\n]*\$?([\d.,]+)/);
            if (displayPriceMatch) {
                const cleanDisplay = displayPriceMatch[1].replace(/\./g, '').replace(',', '.');
                const parsedDisplay = parseFloat(cleanDisplay);
                if (!isNaN(parsedDisplay) && parsedDisplay > 0) {
                    regularPrice = parsedDisplay;
                }
            }

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

// Scrapea todas las páginas disponibles de una tienda Tiendanube (Panatech o Incanto)
async function scrapeTiendaProductos(marca = 'panatech') {
    const brandKey = (marca || 'panatech').toLowerCase();
    const config = BRAND_CONFIGS[brandKey] || BRAND_CONFIGS.panatech;

    const allProducts = [];
    const seenProductIds = new Set();
    const baseUrl = config.baseUrl;
    const maxPages = config.maxPages || 20;

    // 1. Descargar primera página
    console.log(`[Scraper ${brandKey.toUpperCase()}] Descargando página 1: ${baseUrl}`);
    const html1 = await fetchPage(baseUrl);
    const prods1 = parseProductsFromHtml(html1);

    if (!prods1 || prods1.length === 0) {
        return allProducts;
    }

    for (const p of prods1) {
        if (!seenProductIds.has(p.productId)) {
            seenProductIds.add(p.productId);
            allProducts.push(p);
        }
    }

    if (!/\/productos\/page\/2\//.test(html1)) {
        return allProducts;
    }

    // 2. Descargar páginas siguientes en lotes paralelos de 4 páginas
    let currentStartPage = 2;
    const batchPages = 4;
    let keepGoing = true;

    while (keepGoing && currentStartPage <= maxPages) {
        const pageNumbers = [];
        for (let i = 0; i < batchPages && (currentStartPage + i) <= maxPages; i++) {
            pageNumbers.push(currentStartPage + i);
        }

        const results = await Promise.all(pageNumbers.map(async (pNum) => {
            const pageUrl = `${baseUrl}page/${pNum}/`;
            try {
                const html = await fetchPage(pageUrl);
                const prods = parseProductsFromHtml(html);
                const hasNext = new RegExp(`/productos/page/${pNum + 1}/`).test(html);
                return { pNum, prods, hasNext };
            } catch (err) {
                return { pNum, prods: [], hasNext: false };
            }
        }));

        for (const r of results) {
            if (!r.prods || r.prods.length === 0) {
                keepGoing = false;
                break;
            }
            let added = 0;
            for (const p of r.prods) {
                if (!seenProductIds.has(p.productId)) {
                    seenProductIds.add(p.productId);
                    allProducts.push(p);
                    added++;
                }
            }
            console.log(`[Scraper ${brandKey.toUpperCase()}] Página ${r.pNum}: ${r.prods.length} productos (${added} nuevos, acum: ${allProducts.length})`);
            if (!r.hasNext || added === 0) {
                keepGoing = false;
                break;
            }
        }

        currentStartPage += batchPages;
    }

    return allProducts;
}

// Helper para obtener todos los productos de una marca en Supabase superando el límite de 1000 filas
async function fetchAllDbProductsByBrand(supabase, marcaTarget) {
    const allRows = [];
    let from = 0;
    const step = 1000;

    while (true) {
        const { data, error } = await supabase
            .from('productos')
            .select('*')
            .eq('marca', marcaTarget)
            .order('id', { ascending: true })
            .range(from, from + step - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allRows.push(...data);
        if (data.length < step) break;
        from += step;
    }

    return allRows;
}

// Helper para obtener metadatos guardados en Supabase o cache local para cualquier marca
async function obtenerMetadataMarca(supabase, marca = 'panatech') {
    const brandKey = (marca || 'panatech').toLowerCase();
    const config = BRAND_CONFIGS[brandKey];
    if (!config) return {};

    const cacheObj = metadataMemoryCache[brandKey];
    const ahora = Date.now();
    if (cacheObj && cacheObj.data && ahora - cacheObj.lastLoaded < 30000) {
        return cacheObj.data;
    }

    try {
        const { data, error } = await supabase
            .from('ordenes')
            .select('observaciones')
            .eq('numero_orden', config.sysConfigOrderNum)
            .maybeSingle();

        if (error) {
            console.error(`[Scraper ${brandKey}] Error al leer metadata de Supabase:`, error.message);
        }

        if (data && data.observaciones) {
            const parsed = JSON.parse(data.observaciones);
            if (parsed && typeof parsed === 'object') {
                metadataMemoryCache[brandKey] = { data: parsed, lastLoaded: ahora };
                return parsed;
            }
        }
    } catch (err) {
        console.error(`[Scraper ${brandKey}] Error al parsear metadata de Supabase:`, err);
    }

    // Fallback de archivo local si existe
    if (fs.existsSync(config.localCacheFile)) {
        try {
            const raw = fs.readFileSync(config.localCacheFile, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                metadataMemoryCache[brandKey] = { data: parsed, lastLoaded: ahora };
                return parsed;
            }
        } catch (e) {
            // Ignorar
        }
    }

    const emptyMeta = {};
    metadataMemoryCache[brandKey] = { data: emptyMeta, lastLoaded: ahora };
    return emptyMeta;
}

// Helper para persistir metadatos en Supabase y localmente para cualquier marca
async function guardarMetadataMarca(supabase, metadata, marca = 'panatech') {
    const brandKey = (marca || 'panatech').toLowerCase();
    const config = BRAND_CONFIGS[brandKey];
    if (!config) return;

    metadataMemoryCache[brandKey] = { data: metadata, lastLoaded: Date.now() };
    const jsonStr = JSON.stringify(metadata);

    // Guardar en archivo local
    try {
        fs.writeFileSync(config.localCacheFile, jsonStr, 'utf-8');
    } catch (e) {
        // En entornos serverless read-only se ignora error de escritura local
    }

    try {
        const { data: existente } = await supabase
            .from('ordenes')
            .select('id')
            .eq('numero_orden', config.sysConfigOrderNum)
            .maybeSingle();

        if (existente && existente.id) {
            const { error: updateErr } = await supabase
                .from('ordenes')
                .update({ observaciones: jsonStr })
                .eq('id', existente.id);
            if (updateErr) console.error(`[Scraper ${brandKey}] Error al actualizar metadata en Supabase:`, updateErr.message);
        } else {
            const { error: insertErr } = await supabase
                .from('ordenes')
                .insert([{
                    numero_orden: config.sysConfigOrderNum,
                    vendedor: 'sistema',
                    cliente_nombre: config.sysConfigClientName,
                    total: 0,
                    estado: 'Cancelado',
                    observaciones: jsonStr
                }]);
            if (insertErr) console.error(`[Scraper ${brandKey}] Error al insertar metadata en Supabase:`, insertErr.message);
        }
    } catch (err) {
        console.error(`[Scraper ${brandKey}] Error al guardar metadata en Supabase:`, err);
    }
}

// Función genérica de Sincronización y Unificación para Panatech o Incanto
async function sincronizarProductosMarca(supabase, marca = 'panatech') {
    const brandKey = (marca || 'panatech').toLowerCase();
    const config = BRAND_CONFIGS[brandKey];
    if (!config) {
        throw new Error(`Marca no soportada para sincronización web: ${marca}`);
    }

    const inicio = Date.now();
    console.log(`[Scraper ${brandKey.toUpperCase()}] Iniciando sincronización completa...`);

    // 1. Scrapear la tienda online
    const scraped = await scrapeTiendaProductos(brandKey);
    if (!scraped || scraped.length === 0) {
        throw new Error(`No se pudieron obtener productos de la tienda online (${config.baseUrl})`);
    }

    // 2. Traer TODOS los productos de la marca desde la base de datos
    const dbProds = await fetchAllDbProductsByBrand(supabase, brandKey);

    // 3. Traer metadatos previos
    const metadata = await obtenerMetadataMarca(supabase, brandKey);

    // Obtener qué productos tienen ventas registradas en orden_detalles (en lotes si son muchos)
    const allDbIds = (dbProds || []).map(p => p.id);
    const idsConVentas = new Set();
    if (allDbIds.length > 0) {
        try {
            const chunkSize = 500;
            for (let i = 0; i < allDbIds.length; i += chunkSize) {
                const sliceIds = allDbIds.slice(i, i + chunkSize);
                const { data: ventasRef } = await supabase
                    .from('orden_detalles')
                    .select('producto_id')
                    .in('producto_id', sliceIds);
                if (ventasRef) {
                    ventasRef.forEach(v => idsConVentas.add(v.producto_id));
                }
            }
        } catch (e) {
            console.warn(`[Scraper ${brandKey.toUpperCase()}] No se pudo verificar orden_detalles:`, e.message);
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

    const toInsert = [];
    const toUpdate = [];
    const idsToDelete = [];
    const idsToZeroStock = [];

    // 4. Iterar sobre los productos scrapeados y unificar
    for (const sp of scraped) {
        const sNorm = normalizeName(sp.name);

        // Buscar coincidencias en la DB
        let listaCoincidentes = productosPorNombre.get(sNorm);
        if (!listaCoincidentes || listaCoincidentes.length === 0) {
            // Match parcial si longitud > 10
            for (const [nKey, list] of productosPorNombre.entries()) {
                if (nKey.length > 10 && sNorm.length > 10 && (nKey.includes(sNorm) || sNorm.includes(nKey))) {
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

            // Actualizar producto principal con precio efectivo y stock de la web si difiere
            const precioDifiere = Math.abs((parseFloat(principal.precio) || 0) - sp.precioEfectivo) > 0.01;
            const stockDifiere = (parseInt(principal.stock, 10) || 0) !== sp.stock;

            if (precioDifiere || stockDifiere) {
                toUpdate.push({
                    id: principal.id,
                    precio: sp.precioEfectivo,
                    stock: sp.stock
                });
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
                    idsToDelete.push(dup.id);
                } else if (dup.stock !== 0) {
                    idsToZeroStock.push(dup.id);
                }
            }
        } else {
            // Producto NUEVO en el sistema: preparar para insertar
            const nuevoSku = `${config.skuPrefix}${sp.productId.slice(-6)}`;
            toInsert.push({
                sp,
                sNorm,
                row: {
                    codigo_sku: nuevoSku,
                    nombre: sp.name,
                    variante: 'Única',
                    precio: sp.precioEfectivo,
                    stock: sp.stock,
                    marca: brandKey
                }
            });
        }
    }

    // Ejecutar actualizaciones concurrentes en grupos de 20 para alta velocidad
    if (toUpdate.length > 0) {
        const concurrency = 20;
        for (let i = 0; i < toUpdate.length; i += concurrency) {
            const group = toUpdate.slice(i, i + concurrency);
            await Promise.all(group.map(u =>
                supabase
                    .from('productos')
                    .update({ precio: u.precio, stock: u.stock })
                    .eq('id', u.id)
            ));
        }
    }

    // Ejecutar inserciones de productos nuevos en lotes para velocidad óptima
    if (toInsert.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < toInsert.length; i += batchSize) {
            const batch = toInsert.slice(i, i + batchSize);
            const rowsToInsert = batch.map(item => item.row);
            const { data: insertedRows, error: insertErr } = await supabase
                .from('productos')
                .insert(rowsToInsert)
                .select();

            if (!insertErr && insertedRows) {
                for (let j = 0; j < insertedRows.length; j++) {
                    const ins = insertedRows[j];
                    const origin = batch[j] ? batch[j].sp : batch.find(b => b.row.nombre === ins.nombre)?.sp;
                    if (origin) {
                        nuevos++;
                        metadata[ins.id] = {
                            productId: origin.productId,
                            imagen_url: origin.image || '/img/no-image.svg',
                            url_tienda: origin.url,
                            precio_lista: origin.precioLista,
                            precio_efectivo: origin.precioEfectivo,
                            synced_web: true,
                            ultima_sync: new Date().toISOString()
                        };
                    }
                }
            } else if (insertErr) {
                console.error(`[Scraper ${brandKey.toUpperCase()}] Error insertando lote de nuevos productos:`, insertErr.message);
            }
        }
    }

    // Procesar eliminaciones de duplicados sin ventas en lotes
    if (idsToDelete.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < idsToDelete.length; i += chunkSize) {
            const slice = idsToDelete.slice(i, i + chunkSize);
            try {
                await supabase.from('productos').delete().in('id', slice);
            } catch (e) {
                await supabase.from('productos').update({ stock: 0 }).in('id', slice);
            }
        }
    }

    // Poner en stock 0 duplicados con ventas históricas
    if (idsToZeroStock.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < idsToZeroStock.length; i += chunkSize) {
            const slice = idsToZeroStock.slice(i, i + chunkSize);
            await supabase.from('productos').update({ stock: 0 }).in('id', slice);
        }
    }

    // 5. Para los productos que están en el sistema pero NO estaban en la web:
    // Se mantienen intactos y nos aseguramos de que tengan la imagen genérica
    for (const dp of dbProds) {
        if (!metadata[dp.id] && !idsToDelete.includes(dp.id)) {
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
        duplicadosUnificados,
        duracion_ms: Date.now() - inicio
    };

    await guardarMetadataMarca(supabase, metadata, brandKey);

    console.log(`[Scraper ${brandKey.toUpperCase()}] Sincronización finalizada en ${Date.now() - inicio}ms:`, metadata._info);

    return {
        success: true,
        marca: brandKey,
        totalWeb: scraped.length,
        actualizados,
        nuevos,
        sinCambios,
        duplicadosUnificados,
        duracionMs: Date.now() - inicio,
        fecha: metadata._info.ultima_sincronizacion
    };
}

// Wrappers compatibles con Panatech e Incanto
async function scrapePanatechProductos() {
    return scrapeTiendaProductos('panatech');
}

async function scrapeIncantoProductos() {
    return scrapeTiendaProductos('incanto');
}

async function sincronizarProductosPanatech(supabase) {
    return sincronizarProductosMarca(supabase, 'panatech');
}

async function sincronizarProductosIncanto(supabase) {
    return sincronizarProductosMarca(supabase, 'incanto');
}

async function obtenerMetadataPanatech(supabase) {
    return obtenerMetadataMarca(supabase, 'panatech');
}

async function obtenerMetadataIncanto(supabase) {
    return obtenerMetadataMarca(supabase, 'incanto');
}

async function guardarMetadataPanatech(supabase, metadata) {
    return guardarMetadataMarca(supabase, metadata, 'panatech');
}

async function guardarMetadataIncanto(supabase, metadata) {
    return guardarMetadataMarca(supabase, metadata, 'incanto');
}

module.exports = {
    scrapeTiendaProductos,
    scrapePanatechProductos,
    scrapeIncantoProductos,
    sincronizarProductosMarca,
    sincronizarProductosPanatech,
    sincronizarProductosIncanto,
    obtenerMetadataMarca,
    obtenerMetadataPanatech,
    obtenerMetadataIncanto,
    guardarMetadataMarca,
    guardarMetadataPanatech,
    guardarMetadataIncanto,
    fetchAllDbProductsByBrand,
    normalizeName
};
