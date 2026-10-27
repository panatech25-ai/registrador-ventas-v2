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
        maxPages: 12,
        storeIdEnv: 'TIENDANUBE_PANATECH_STORE_ID',
        accessTokenEnv: 'TIENDANUBE_PANATECH_ACCESS_TOKEN',
        descuentoEfectivoRatio: 0.85
    },
    incanto: {
        marca: 'incanto',
        baseUrl: 'https://www.incantorosario.com.ar/productos/',
        skuPrefix: 'INC-W-',
        sysConfigOrderNum: 'SYS_CONFIG_PRODUCTOS_METADATA_INCANTO',
        sysConfigClientName: 'Metadata Productos Incanto',
        localCacheFile: path.join(__dirname, 'incanto_metadata_cache.json'),
        maxPages: 25,
        storeIdEnv: 'TIENDANUBE_INCANTO_STORE_ID',
        accessTokenEnv: 'TIENDANUBE_INCANTO_ACCESS_TOKEN',
        descuentoEfectivoRatio: 0.85
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

// ── Obtiene variantes de producto por streaming abortable ultrarrápido (primeros 70KB) ──
function fetchVariantsQuick(url, timeoutMs = 5000) {
    return new Promise((resolve) => {
        if (!url || !url.startsWith('http')) return resolve(null);

        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: timeoutMs
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (redirectUrl.startsWith('/')) {
                    try {
                        const parsed = new URL(url);
                        redirectUrl = `${parsed.origin}${redirectUrl}`;
                    } catch (_) {}
                }
                return fetchVariantsQuick(redirectUrl, timeoutMs).then(resolve);
            }

            if (res.statusCode >= 400) {
                return resolve(null);
            }

            let buffer = '';
            let resolved = false;

            res.on('data', (chunk) => {
                if (resolved) return;
                buffer += chunk;
                const match = buffer.match(/LS\.variants\s*=\s*(\[[\s\S]*?\]);/);
                if (match) {
                    resolved = true;
                    try {
                        const parsed = JSON.parse(match[1]);
                        req.destroy();
                        return resolve(parsed);
                    } catch (_) {
                        // Esperar más chunks si el JSON no se completó en este chunk
                    }
                }
                // Si ya leímos más de 90KB y no apareció LS.variants, abortar para no descargar megabytes innecesarios
                if (buffer.length > 90000) {
                    resolved = true;
                    req.destroy();
                    return resolve(null);
                }
            });

            res.on('end', () => {
                if (!resolved) {
                    const match = buffer.match(/LS\.variants\s*=\s*(\[[\s\S]*?\]);/);
                    if (match) {
                        try {
                            return resolve(JSON.parse(match[1]));
                        } catch (_) {}
                    }
                    resolve(null);
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });

        req.on('error', () => resolve(null));
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

            const hasSecondary = blockHtml.includes('js-product-item-private-with-secondary-images');

            products.push({
                productId,
                name,
                image,
                url,
                hasSecondary,
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

    // 3. Verificar variantes desde la ficha de cada producto
    // Nota: Muchos productos con variantes (como opciones de color o modelo) no poseen imágenes secundarias en la grilla.
    // - En Panatech (catálogo compacto de ~130 items) verificamos el 100% de los productos de forma ultrarrápida por streaming (< 3 seg).
    // - En Incanto verificamos los productos con fotos secundarias o con pistas de variantes (colores, tonos, talle, packs).
    const prodsWithVariantsToCheck = allProducts.filter(p => {
        if (!p.url) return false;
        if (brandKey === 'panatech') return true;
        if (p.hasSecondary) return true;
        const nombreNorm = normalizeName(p.name || '');
        const tienePista = /negro|blanco|rosa|azul|verde|rojo|amarillo|dorado|plateado|gris|lila|violeta|naranja|beige|marron|celeste|bordo|fucsia|turquesa|pack|x[0-9]|talle|tono|color|surtido|dapop|variante|swatch/i.test(nombreNorm);
        return tienePista;
    });

    if (prodsWithVariantsToCheck.length > 0) {
        console.log(`[Scraper ${brandKey.toUpperCase()}] Verificando variantes en detalle para ${prodsWithVariantsToCheck.length} productos...`);
        const batchSizeVariants = 15;
        for (let i = 0; i < prodsWithVariantsToCheck.length; i += batchSizeVariants) {
            const batch = prodsWithVariantsToCheck.slice(i, i + batchSizeVariants);
            await Promise.all(batch.map(async (p) => {
                try {
                    const parsed = await fetchVariantsQuick(p.url, 4500);
                    if (Array.isArray(parsed) && parsed.length > 1 && parsed.some(v => v.option0 || v.option1)) {
                        p.variants = parsed;
                    }
                } catch (err) {
                    // Si falla el streaming, se mantiene como producto simple
                }
            }));
        }
    }

    // 4. Expandir productos con variantes para que cada variante sea un producto completo con su imagen correspondiente
    const expandedProducts = [];
    for (const p of allProducts) {
        if (p.variants && p.variants.length > 1) {
            for (const v of p.variants) {
                // Soporte para variantes simples (ej. Color) y combinadas (ej. Color / Talle)
                const varOptions = [v.option0, v.option1, v.option2].filter(Boolean).map(s => String(s).trim());
                const varName = varOptions.join(' / ') || 'Única';
                let varImg = v.image_url ? (v.image_url.startsWith('//') ? 'https:' + v.image_url : v.image_url) : p.image;

                let varStock = 0;
                if (v.stock !== null && v.stock !== undefined) {
                    varStock = parseInt(v.stock, 10) || 0;
                } else if (v.available) {
                    varStock = 1;
                }

                let varPrecioLista = v.price_number || p.precioLista;
                let varPrecioEfectivo = p.precioEfectivo;
                if (v.price_with_payment_discount_short) {
                    const clean = String(v.price_with_payment_discount_short).replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
                    const parsed = parseFloat(clean);
                    if (!isNaN(parsed) && parsed > 0) varPrecioEfectivo = parsed;
                }

                expandedProducts.push({
                    productId: p.productId,
                    variantId: v.id,
                    name: p.name,
                    variantName: varName,
                    image: varImg,
                    url: p.url,
                    precioLista: varPrecioLista,
                    precioEfectivo: varPrecioEfectivo,
                    stock: varStock,
                    esVariante: true
                });
            }
        } else {
            expandedProducts.push({
                ...p,
                variantName: 'Única',
                esVariante: false
            });
        }
    }

    return expandedProducts;
}

// ── Convierte productos y variantes de la API oficial de Tiendanube al esquema unificado ──
function expandApiProducts(rawProducts, descuentoRatio = 0.85) {
    const expanded = [];

    for (const p of rawProducts) {
        const productId = String(p.id);
        const name = p.name ? (p.name.es || Object.values(p.name)[0] || '') : '';
        const url = p.canonical_url || '';

        const imgMap = new Map();
        (p.images || []).forEach(img => {
            if (img && img.id && img.src) {
                imgMap.set(img.id, img.src.startsWith('//') ? 'https:' + img.src : img.src);
            }
        });
        const defaultImg = (p.images && p.images[0] && p.images[0].src)
            ? (p.images[0].src.startsWith('//') ? 'https:' + p.images[0].src : p.images[0].src)
            : '/img/no-image.svg';

        const variants = Array.isArray(p.variants) ? p.variants : [];

        if (variants.length > 1) {
            for (const v of variants) {
                const varName = (v.values && v.values.length > 0)
                    ? v.values.map(val => val.es || Object.values(val)[0]).filter(Boolean).join(' / ')
                    : 'Única';
                const varImg = (v.image_id && imgMap.get(v.image_id)) || defaultImg;

                let varStock = 0;
                if (v.stock !== null && v.stock !== undefined) {
                    varStock = parseInt(v.stock, 10) || 0;
                } else if (v.available) {
                    varStock = 1;
                }

                const precioLista = parseFloat(v.price) || 0;
                let precioEfectivo = v.promotional_price
                    ? parseFloat(v.promotional_price)
                    : Math.round(precioLista * descuentoRatio * 100) / 100;

                expanded.push({
                    productId,
                    variantId: v.id,
                    name,
                    variantName: varName,
                    image: varImg,
                    url,
                    precioLista,
                    precioEfectivo,
                    stock: varStock,
                    sku: v.sku || null,
                    esVariante: true
                });
            }
        } else {
            const v0 = variants[0] || {};
            const precioLista = parseFloat(v0.price) || 0;
            const precioEfectivo = v0.promotional_price
                ? parseFloat(v0.promotional_price)
                : Math.round(precioLista * descuentoRatio * 100) / 100;

            let stock = 0;
            if (v0.stock !== null && v0.stock !== undefined) {
                stock = parseInt(v0.stock, 10) || 0;
            } else if (v0.available) {
                stock = 1;
            }

            expanded.push({
                productId,
                variantId: v0.id || null,
                name,
                variantName: 'Única',
                image: defaultImg,
                url,
                precioLista,
                precioEfectivo,
                stock,
                sku: v0.sku || null,
                esVariante: false
            });
        }
    }

    return expanded;
}

// ── Consulta catálogo completo mediante la API REST oficial de Tiendanube ──
function fetchProductosTiendanubeAPI(brandKey) {
    const config = BRAND_CONFIGS[brandKey];
    if (!config) return Promise.resolve(null);

    const storeId = process.env[config.storeIdEnv];
    const accessToken = process.env[config.accessTokenEnv];

    if (!storeId || !accessToken) {
        return Promise.resolve(null);
    }

    const descuentoRatio = config.descuentoEfectivoRatio || 0.85;

    return new Promise((resolve, reject) => {
        let allRawProducts = [];
        let page = 1;

        function fetchNextPage() {
            const options = {
                hostname: 'api.tiendanube.com',
                port: 443,
                path: `/v1/${storeId}/products?per_page=200&page=${page}`,
                method: 'GET',
                headers: {
                    'Authentication': `bearer ${accessToken}`,
                    'User-Agent': `RegistradorVentas (${storeId}@tiendanube.com)`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        return reject(new Error(`Tiendanube API HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                    }
                    try {
                        const prods = JSON.parse(data);
                        if (!Array.isArray(prods) || prods.length === 0) {
                            return resolve(expandApiProducts(allRawProducts, descuentoRatio));
                        }
                        allRawProducts = allRawProducts.concat(prods);
                        if (prods.length < 200) {
                            return resolve(expandApiProducts(allRawProducts, descuentoRatio));
                        }
                        page++;
                        fetchNextPage();
                    } catch (e) {
                        reject(new Error(`Error al parsear respuesta JSON de Tiendanube API: ${e.message}`));
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Timeout al consultar Tiendanube API'));
            });

            req.on('error', reject);
            req.end();
        }

        fetchNextPage();
    });
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
    console.log(`[Sync ${brandKey.toUpperCase()}] Iniciando sincronización completa...`);

    // 1. Obtener productos de la tienda (vía API oficial de Tiendanube si hay credenciales, o fallback a scraper web)
    let scraped = null;
    let metodoSync = 'web_scraper';

    try {
        const apiProds = await fetchProductosTiendanubeAPI(brandKey);
        if (apiProds && apiProds.length > 0) {
            scraped = apiProds;
            metodoSync = 'api_tiendanube';
            console.log(`[Sync ${brandKey.toUpperCase()}] Obtenidos ${scraped.length} productos/variantes vía API oficial de Tiendanube`);
        }
    } catch (apiErr) {
        console.warn(`[Sync ${brandKey.toUpperCase()}] Error al consultar API de Tiendanube (${apiErr.message}). Intentando scraper web...`);
    }

    if (!scraped) {
        console.log(`[Sync ${brandKey.toUpperCase()}] Consultando productos vía scraper web...`);
        scraped = await scrapeTiendaProductos(brandKey);
    }

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
    const matchedDbIds = new Set();

    // 4. Iterar sobre los productos scrapeados y unificar
    for (const sp of scraped) {
        const sNorm = normalizeName(sp.name);
        const varNorm = normalizeName(sp.variantName || '');

        let principal = null;

        // A. Coincidencia exacta por metadata (productId + variantId)
        if (sp.variantId) {
            principal = (dbProds || []).find(p => !matchedDbIds.has(p.id) && metadata[p.id]?.productId === sp.productId && String(metadata[p.id]?.variantId) === String(sp.variantId));
        }

        // B. Coincidencia por metadata (productId + nombre con variante o variante coincidente)
        if (!principal && sp.esVariante && varNorm) {
            principal = (dbProds || []).find(p => {
                if (matchedDbIds.has(p.id)) return false;
                if (metadata[p.id]?.productId !== sp.productId) return false;
                const pVarNorm = normalizeName(p.variante || '');
                const pNomNorm = normalizeName(p.nombre || '');
                return pVarNorm === varNorm || pNomNorm.includes(varNorm);
            });
        }

        // C. Coincidencia por nombre normalizado Y variante coincidente (o nombre con color)
        if (!principal && sp.esVariante && varNorm) {
            principal = (dbProds || []).find(p => {
                if (matchedDbIds.has(p.id)) return false;
                const pNomNorm = normalizeName(p.nombre || '');
                const pVarNorm = normalizeName(p.variante || '');
                const nombreCoincide = pNomNorm === sNorm || (pNomNorm.length > 10 && (pNomNorm.includes(sNorm) || sNorm.includes(pNomNorm)));
                if (!nombreCoincide) return false;
                return pVarNorm === varNorm || pNomNorm.includes(varNorm);
            });
        }

        // D. Coincidencia por nombre para producto base (o variante inicial)
        if (!principal) {
            const candidatos = (dbProds || []).filter(p => {
                if (matchedDbIds.has(p.id)) return false;
                const pNomNorm = normalizeName(p.nombre || '');
                const pVarNorm = normalizeName(p.variante || '');

                if (sp.esVariante && varNorm && pVarNorm && pVarNorm !== 'unica' && pVarNorm !== varNorm) {
                    return false;
                }

                const COLORES_CONOCIDOS = ['negro', 'blanco', 'rosa', 'azul', 'rojo', 'verde', 'gris', 'amarillo', 'celeste', 'lila', 'violeta', 'dorado', 'plateado', 'naranja', 'bordo', 'fucsia', 'turquesa', 'beige', 'marron', 'transparente'];
                if (sp.esVariante && varNorm && COLORES_CONOCIDOS.some(c => c !== varNorm && pNomNorm.includes(c))) {
                    return false;
                }

                return pNomNorm === sNorm || (pNomNorm.length > 10 && (pNomNorm.includes(sNorm) || sNorm.includes(pNomNorm)));
            });

            if (candidatos.length > 0) {
                candidatos.sort((a, b) => {
                    const aVentas = idsConVentas.has(a.id) ? 1 : 0;
                    const bVentas = idsConVentas.has(b.id) ? 1 : 0;
                    if (aVentas !== bVentas) return bVentas - aVentas;
                    return a.id - b.id;
                });
                principal = candidatos[0];
            }
        }

        if (principal) {
            matchedDbIds.add(principal.id);

            const precioDifiere = Math.abs((parseFloat(principal.precio) || 0) - sp.precioEfectivo) > 0.01;
            const stockDifiere = (parseInt(principal.stock, 10) || 0) !== sp.stock;
            const varianteDifiere = sp.variantName && sp.variantName !== 'Única' && principal.variante !== sp.variantName;

            const nuevaVariante = (sp.variantName && sp.variantName !== 'Única') ? sp.variantName : (principal.variante || 'Única');

            if (precioDifiere || stockDifiere || varianteDifiere) {
                toUpdate.push({
                    id: principal.id,
                    precio: sp.precioEfectivo,
                    stock: sp.stock,
                    variante: nuevaVariante
                });
                actualizados++;
            } else {
                sinCambios++;
            }

            metadata[principal.id] = {
                productId: sp.productId,
                variantId: sp.variantId || null,
                variante: nuevaVariante,
                imagen_url: sp.image || '/img/no-image.svg',
                url_tienda: sp.url,
                precio_lista: sp.precioLista,
                precio_efectivo: sp.precioEfectivo,
                synced_web: true,
                ultima_sync: new Date().toISOString()
            };

            // Buscar duplicados redundantes de ESTA misma variante (mismo nombre Y misma variante)
            const duplicadosSecundarios = (dbProds || []).filter(dup => {
                if (dup.id === principal.id || matchedDbIds.has(dup.id)) return false;
                const dNom = normalizeName(dup.nombre || '');
                const dVar = normalizeName(dup.variante || '');
                return dNom === sNorm && dVar === normalizeName(nuevaVariante);
            });

            for (const dup of duplicadosSecundarios) {
                matchedDbIds.add(dup.id);
                duplicadosUnificados++;
                metadata[dup.id] = {
                    productId: sp.productId,
                    variantId: sp.variantId || null,
                    variante: nuevaVariante,
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
            // Producto o variante NUEVA en el sistema: preparar para insertar
            const varSuffix = sp.variantId ? `-${String(sp.variantId).slice(-4)}` : (sp.variantName && sp.variantName !== 'Única' ? `-${normalizeName(sp.variantName).slice(0, 3)}` : '');
            const nuevoSku = (sp.sku && sp.sku.trim()) ? sp.sku.trim() : `${config.skuPrefix}${sp.productId.slice(-6)}${varSuffix}`;
            toInsert.push({
                sp,
                sNorm,
                row: {
                    codigo_sku: nuevoSku,
                    nombre: sp.name,
                    variante: sp.variantName || 'Única',
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
                    .update({ precio: u.precio, stock: u.stock, variante: u.variante })
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
                    const origin = batch[j] ? batch[j].sp : batch.find(b => b.row.nombre === ins.nombre && b.row.variante === ins.variante)?.sp;
                    if (origin) {
                        nuevos++;
                        metadata[ins.id] = {
                            productId: origin.productId,
                            variantId: origin.variantId || null,
                            variante: origin.variantName || ins.variante || 'Única',
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
        metodo_sync: metodoSync,
        total_web: scraped.length,
        actualizados,
        nuevos,
        sinCambios,
        duplicadosUnificados,
        duracion_ms: Date.now() - inicio
    };

    await guardarMetadataMarca(supabase, metadata, brandKey);

    console.log(`[Sync ${brandKey.toUpperCase()}] Sincronización finalizada en ${Date.now() - inicio}ms (${metodoSync}):`, metadata._info);

    return {
        success: true,
        marca: brandKey,
        metodoSync,
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
    fetchProductosTiendanubeAPI,
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
