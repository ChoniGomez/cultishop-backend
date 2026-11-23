import { pool } from '../config/database';

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = 'qwen2.5:0.5b';
const N8N_CHATBOT_WEBHOOK_URL =
  process.env.N8N_CHATBOT_WEBHOOK_URL ||
  'https://n8n.cultishop.com.ar/webhook/42bd90be-4037-4ae6-b2a5-3d332a976964';
const SQL_CANDIDATE_LIMIT = 30;
const MAX_PRODUCTS_FOR_PROMPT = 5;

const FALLBACK_RESPONSE =
  'Lo siento, en este momento no puedo consultar esa información. Por favor, inténtalo nuevamente en unos minutos o contacta al equipo de CultiShop.';

const GREETING_RESPONSE =
  '¡Hola! Soy Culti, tu asistente experto en CultiShop. ¿En qué puedo ayudarte hoy con tus cultivos o insumos?';

/**
 * Datos institucionales oficiales y fijos de CultiShop.
 */
const INSTITUTIONAL_DATA = {
  direccion: 'Av. López y Planes casi Lavalle (adentro del ACARIUM), Posadas, Misiones.',
  horarios: 'Lunes a sábado de 09:00 a 12:00 y 16:30 a 19:30 Hs.',
  envios: 'A todo el país por Correo Argentino o Vía Cargo.',
  pagos: 'Efectivo, transferencia bancaria y tarjetas de crédito/débito.'
};

type UserIntent = 'GREETING' | 'INSTITUTIONAL' | 'PRODUCT_SEARCH';

interface ProductRow {
  title: string;
  brand: string | null;
  format: string | null;
  price: string;
  discount_price: string | null;
  stock: number;
  options: unknown;
  category_name: string | null;
  subcategory_name: string | null;
}

interface OllamaGenerateResponse {
  response?: string;
  error?: string;
}

/**
 * Palabras vacías (stopwords), adjetivos de precio, verbos comunes y términos institucionales
 * que no deben buscarse como nombres literales de productos.
 */
const STOPWORDS = new Set([
  'a', 'al', 'algo', 'algun', 'alguna', 'algunos', 'algunas', 'ante', 'con', 'como',
  'cual', 'cuales', 'cuanto', 'cuantos', 'cuesta', 'cuestan', 'de', 'del', 'desde',
  'donde', 'el', 'ella', 'ellos', 'en', 'entre', 'era', 'es', 'esa', 'ese', 'eso',
  'esta', 'estan', 'este', 'esto', 'hay', 'hola', 'la', 'las', 'le', 'les', 'lo',
  'los', 'mas', 'me', 'mi', 'mis', 'mucho', 'muy', 'necesito', 'no', 'nos', 'o',
  'para', 'pero', 'por', 'buenas', 'buen', 'buenos', 'dia', 'dias', 'tarde', 'tardes',
  'noche', 'noches', 'tal', 'precio', 'precios', 'puede', 'pueden', 'quiero', 'quisiera',
  'que', 'recomendas', 'recomiendas', 'sale', 'salen', 'se', 'si', 'sin', 'sobre', 'son',
  'su', 'sus', 'te', 'tenes', 'tienen', 'tiene', 'tengo', 'todo', 'todos', 'tu', 'tus',
  'un', 'una', 'uno', 'unos', 'unas', 'usted', 'ustedes', 'venden', 'vende', 'ver', 'y',
  'ya', 'busco', 'buscando', 'consultar', 'consulta', 'culti', 'cultishop', 'stock',
  'disponible', 'disponibles', 'opciones', 'opcion', 'producto', 'productos', 'mostrar',
  'mostrame', 'decime', 'pasar', 'pasame', 'ofrecer', 'ofreces', 'ofrecen', 'horario',
  'horarios', 'atienden', 'atencion', 'abren', 'abierto', 'cierran', 'ubicacion',
  'direccion', 'queda', 'llegar', 'local', 'retiro', 'retirar', 'envio', 'envios',
  'mandados', 'correo', 'argentino', 'via', 'cargo', 'pago', 'pagos', 'mercado',
  'transferencia', 'transferencias', 'efectivo', 'billetera', 'billeteras', 'contacto',
  'telefono', 'whatsapp', 'instagram', 'redes', 'posadas', 'misiones', 'lopez',
  'planes', 'lavalle', 'acarium', 'acuarium', 'adentro', 'llamas', 'nombre', 'quien',
  'sos', 'eres', 'hora', 'horas', 'sabado', 'sabados', 'lunes', 'viernes', 'hacen',
  'haces', 'realizan', 'ayuda', 'ayudar', 'ayudarme', 'andas', 'va', 'bien', 'gracias',
  'saludos', 'calle', 'domicilio', 'ubicados', 'sucursal', 'tienda', 'barato', 'barata',
  'baratos', 'baratas', 'economico', 'economica', 'economicos', 'economicas', 'accesible',
  'accesibles', 'menor', 'minimo', 'medios', 'aceptan', 'aceptamos', 'tarjeta',
  'tarjetas', 'credito', 'creditos', 'debito', 'debitos', 'metodos', 'formas',
  'interior', 'pais', 'nacional', 'argentina', 'pagar', 'abonar', 'abonan', 'puedo',
  'pueden', 'estas', 'onda', 'che', 'hey', 'holis', 'llego', 'voy', 'ir', 'fisica',
  'fisico', 'encuentran', 'encuentra', 'quedan', 'negocio', 'mapa', 'maps', 'google',
  'zona', 'barrio', 'altura', 'ubicado', 'ubicada', 'ubicadas', 'punto', 'venta'
]);

/**
 * Diccionario de intenciones de búsqueda de productos y sus términos asociados en catálogo.
 */
const PRODUCT_KEYWORDS: Array<{ triggers: string[]; searchTerms: string[] }> = [
  {
    triggers: ['medidor de ph', 'medidor ph', 'peachimetro'],
    searchTerms: ['medidor de ph', 'medidor ph', 'medidor']
  },
  {
    triggers: ['medidor de ec', 'medidor ec', 'conductimetro'],
    searchTerms: ['medidor de ec', 'medidor ec', 'conductividad', 'medidor']
  },
  {
    triggers: ['termohigrometro', 'higrometro', 'termometro'],
    searchTerms: ['termohigrometro', 'higrometro', 'termometro']
  },
  {
    triggers: [
      'fertilizante', 'fertilizantes', 'nutriente', 'nutrientes', 'abono', 'abonos',
      'aditivo', 'aditivos', 'radicular', 'radiculares', 'bioestimulante', 'flora',
      'floracion', 'vegetacion', 'engorde'
    ],
    searchTerms: ['fertilizante', 'nutriente', 'abono', 'aditivo', 'radicular', 'booster', 'flora', 'floracion', 'bloom']
  },
  {
    triggers: ['sustrato', 'sustratos', 'coco', 'tierra', 'tierras', 'humus', 'perlita', 'turba'],
    searchTerms: ['sustrato', 'sustratos', 'coco', 'tierra', 'humus', 'perlita', 'turba', 'growmix', 'cultivate']
  },
  {
    triggers: ['maceta', 'macetas', 'contenedor', 'contenedores', 'geotextil', 'soplada'],
    searchTerms: ['maceta', 'contenedor', 'geotextil', 'soplada']
  },
  {
    triggers: [
      'hidroponia', 'hidroponico', 'hidroponica', 'hidroponicos', 'hidroponicas',
      'dwc', 'deep water culture', 'cultivo hidroponico'
    ],
    searchTerms: [
      'dwc', 'deep water culture', 'balde', 'maceta hidro', 'maceta hidrop',
      'esponja'
    ]
  },
  {
    triggers: ['seda', 'sedas', 'papelillo', 'papelillos', 'papel', 'papeles', 'celulosa'],
    searchTerms: ['seda', 'papelillo', 'celulosa']
  },
  {
    triggers: ['picador', 'picadores', 'grinder', 'triturador', 'trituradores'],
    searchTerms: ['picador', 'grinder', 'triturador']
  },
  {
    triggers: ['semilla', 'semillas', 'esqueje', 'esquejes', 'clon', 'clones'],
    searchTerms: ['semilla', 'esqueje', 'clon']
  },
  {
    triggers: [
      'indoor', 'carpa', 'carpas', 'cultivo interior', 'ventilacion', 'extractor',
      'intractor', 'cooler', 'filtro de carbón', 'filtro de carbon'
    ],
    searchTerms: ['indoor', 'carpa', 'ventilacion', 'extractor', 'cooler', 'filtro']
  },
  {
    triggers: ['led', 'iluminacion', 'iluminaciones', 'luz', 'luces', 'lampara', 'lamparas', 'panel'],
    searchTerms: ['led', 'iluminacion', 'iluminación', 'luz', 'lampara', 'panel']
  },
  {
    triggers: ['medidor', 'medicion', 'ph', 'ec', 'conductividad'],
    searchTerms: ['medidor', 'medicion', 'medición', 'ph', 'ec', 'conductividad']
  },
  { triggers: ['kit', 'kits', 'combo', 'combos'], searchTerms: ['kit', 'combo'] },
  {
    triggers: ['parafernalia', 'bong', 'bongs', 'pipa', 'pipas', 'filtro', 'filtros', 'bandeja'],
    searchTerms: ['parafernalia', 'bong', 'pipa', 'filtro', 'bandeja']
  },
  {
    triggers: ['plaga', 'plagas', 'insecticida', 'preventivo', 'mamboreta', 'jabon potasico', 'neem'],
    searchTerms: ['mamboreta', 'plaga', 'insecticida', 'potasico', 'neem', 'tricoderma']
  },
  {
    triggers: ['extraccion', 'extracciones', 'extracto', 'extractos'],
    searchTerms: ['extraccion', 'extracción', 'extracto']
  },
  { triggers: ['curado', 'curar'], searchTerms: ['curado', 'curar'] }
];

/**
 * Normaliza un texto quitando tildes, signos y pasándolo a minúsculas.
 */
function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Convierte palabras plurales simples a su raíz singular (ej: "sustratos" -> "sustrato").
 */
function toSingularStem(word: string): string {
  if (word.length > 4 && word.endsWith('es') && !/[aeiou]es$/.test(word)) {
    return word.slice(0, -2);
  }
  if (word.length > 3 && word.endsWith('s')) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Detecta si el usuario está preguntando por la opción más barata o económica.
 */
function esConsultaPorMasBarato(mensaje: string): boolean {
  const normalized = normalizeText(mensaje);
  return /\b(mas barato|mas barata|mas baratos|mas baratas|barato|barata|baratos|baratas|economico|economica|economicos|economicas|mas economico|mas economica|menor precio|mas accesible)\b/.test(
    normalized
  );
}

/**
 * Calcula el precio numérico efectivo de un producto (considerando descuento si aplica).
 */
function obtenerPrecioEfectivo(row: ProductRow): number {
  const basePrice = Number(row.price) || 0;
  const discountPrice = row.discount_price ? Number(row.discount_price) : 0;
  return discountPrice > 0 && discountPrice < basePrice ? discountPrice : basePrice;
}

/**
 * Extrae tokens significativos de búsqueda de productos excluyendo stopwords y palabras institucionales.
 */
function getSpecificQueryTokens(mensaje: string): string[] {
  const normalized = normalizeText(mensaje);
  if (!normalized) return [];
  return normalized
    .split(/\s+/)
    .filter(word => word.length >= 2 && !STOPWORDS.has(word));
}

/**
 * Genera los patrones ILIKE (%termino%) para la consulta SQL de productos.
 */
function getProductSearchPatterns(mensaje: string): string[] {
  const normalizedMessage = normalizeText(mensaje);
  const words = new Set(normalizedMessage.split(/\s+/).filter(Boolean));
  const matchedTerms = new Set<string>();

  for (const token of getSpecificQueryTokens(mensaje)) {
    matchedTerms.add(token);
    matchedTerms.add(toSingularStem(token));
  }

  for (const keywordGroup of PRODUCT_KEYWORDS) {
    if (
      keywordGroup.triggers.some(keyword =>
        keyword.includes(' ')
          ? ` ${normalizedMessage} `.includes(` ${keyword} `)
          : words.has(keyword)
      )
    ) {
      for (const term of keywordGroup.searchTerms) {
        matchedTerms.add(term);
      }
    }
  }

  return [...matchedTerms].map(term => `%${term}%`);
}

function getCategorySearchPatterns(mensaje: string): string[] {
  const normalizedMessage = normalizeText(mensaje);
  const words = new Set(normalizedMessage.split(/\s+/).filter(Boolean));
  const isHydroponicsQuery =
    words.has('hidroponia') ||
    words.has('hidroponico') ||
    words.has('hidroponica') ||
    words.has('hidroponicos') ||
    words.has('hidroponicas') ||
    words.has('dwc') ||
    ` ${normalizedMessage} `.includes(' deep water culture ') ||
    ` ${normalizedMessage} `.includes(' cultivo hidroponico ');

  return isHydroponicsQuery ? ['%indoor%', '%accesorios indoor%'] : [];
}

/**
 * Detecta si la consulta del usuario refiere a datos institucionales (horarios, dirección, ubicación, envíos, pagos).
 */
function esConsultaInstitucional(mensaje: string): boolean {
  const normalizedMessage = normalizeText(mensaje);

  return /\b(horario|horarios|atienden|atencion|abren|abierto|cierran|hora|sabado|sabados|domingo|domingos|ubicacion|ubicado|ubicada|ubicados|ubicadas|direccion|domicilio|calle|altura|zona|barrio|donde queda|donde quedan|donde estan|donde se encuentran|como llegar|como llego|como voy|como ir|local|local fisico|tienda|tienda fisica|negocio|sucursal|punto de venta|posadas|misiones|acarium|acuarium|lopez y planes|lavalle|mapa|maps|google maps|retiro|retirar|envio|envios|interior|pais|mandados|correo argentino|via cargo|pago|pagos|pagar|abonar|abonan|medio de pago|medios de pago|forma de pago|formas de pago|mercado pago|transferencia|transferencias|efectivo|billetera|billeteras|tarjeta|tarjetas|credito|debito|contacto|telefono|whatsapp|instagram|redes)\b/.test(
    normalizedMessage
  );
}

/**
 * Etapa 1 de Arquitectura: Clasificador Previo de Intenciones (Intent Router).
 * Separa de forma determinista:
 * - GREETING: Saludos o aperturas de conversación sin búsqueda.
 * - INSTITUTIONAL: Consultas sobre horarios, dirección, ubicación o envíos.
 * - PRODUCT_SEARCH: Consultas sobre artículos, insumos, sustratos, herramientas, etc.
 */
function classifyUserIntent(
  mensaje: string,
  categorySearchPatterns: string[]
): UserIntent {
  const hasProductKeywords =
    categorySearchPatterns.length > 0 ||
    esConsultaPorMasBarato(mensaje) ||
    getSpecificQueryTokens(mensaje).length > 0;
  const isInstitutional = esConsultaInstitucional(mensaje);

  // Si pregunta por horarios, dirección o envíos y no está buscando un producto específico
  if (isInstitutional && !hasProductKeywords) {
    return 'INSTITUTIONAL';
  }

  // Si existen términos de producto, categoría o consulta por el más barato
  if (hasProductKeywords) {
    return 'PRODUCT_SEARCH';
  }

  // Cualquier saludo simple ("hola", "buen día", "buenas") o mensaje general sin producto
  return 'GREETING';
}

/**
 * Elimina códigos internos, IDs, frases genéricas de base de datos y "[object Object]".
 */
function limpiarTextoBasura(texto: string): string {
  return texto
    .replace(/\[object\s+Object\]/gi, '')
    .replace(/insumo\s+oficial\s+cultishop\s*[-–—:]?\s*c[oó]digo\s*\d+/gi, '')
    .replace(/\bc[oó]digo\s*(?:interno|id|#|:)?\s*\d+\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Filtra y ordena los candidatos de PostgreSQL.
 * - Si `buscaMasBarato` es true: ordena estrictamente por precio ascendente y devuelve 1 solo producto.
 * - En caso normal: prioriza coincidencias en título y devuelve máximo 4 o 5 productos.
 */
function filtrarYOrdenarPorPrecision(
  rows: ProductRow[],
  mensaje: string,
  buscaMasBarato: boolean
): ProductRow[] {
  if (rows.length === 0) return [];

  const queryTokens = getSpecificQueryTokens(mensaje);
  const normalizedQuery = normalizeText(mensaje);

  if (queryTokens.length === 0) {
    if (buscaMasBarato) {
      const sortedByPrice = [...rows].sort(
        (a, b) => obtenerPrecioEfectivo(a) - obtenerPrecioEfectivo(b)
      );
      return sortedByPrice.slice(0, 1);
    }
    return rows.slice(0, MAX_PRODUCTS_FOR_PROMPT);
  }

  const asksForMeter = /\b(medidor|medidores|peachimetro|conductimetro|termohigrometro|higrometro|termometro|balanza)\b/.test(
    normalizedQuery
  );

  const scored = rows.map(row => {
    const normTitle = normalizeText(row.title || '');
    const normSub = normalizeText(row.subcategory_name || '');
    const normCat = normalizeText(row.category_name || '');

    let score = 10;
    let titleTokenMatches = 0;

    for (const token of queryTokens) {
      const stem = toSingularStem(token);

      if (` ${normTitle} `.includes(` ${token} `) || ` ${normTitle} `.includes(` ${stem} `)) {
        score += 35;
        titleTokenMatches += 1;
      } else if (normTitle.includes(token) || normTitle.includes(stem)) {
        score += 22;
        titleTokenMatches += 1;
      } else if (
        normSub.includes(token) ||
        normSub.includes(stem) ||
        normCat.includes(token) ||
        normCat.includes(stem)
      ) {
        score += 15;
      }
    }

    // Si el usuario pide específicamente un medidor/instrumento, descartar líquidos reguladores de pH
    if (asksForMeter) {
      const isInstrument = /\b(medidor|peachimetro|conductimetro|termohigrometro|higrometro|termometro|balanza|tester|digital)\b/.test(
        normTitle
      );
      const isLiquidRegulator = /\b(menos|mas|reductor|regulador|elevador|acido|solucion|buffer|calibracion|liquido)\b/.test(
        normTitle
      );

      if (isInstrument) {
        score += 60;
      }
      if (isLiquidRegulator && !isInstrument) {
        score -= 100;
      }
    }

    return { row, score, titleTokenMatches };
  });

  const positiveMatches = scored.filter(item => item.score > 0);
  const candidates = positiveMatches.length > 0 ? positiveMatches : scored;

  const exactTitleMatches = candidates.filter(
    item => item.titleTokenMatches === queryTokens.length
  );
  const finalPool = exactTitleMatches.length > 0 ? exactTitleMatches : candidates;

  // Si el usuario preguntó por "el más barato" o "económico", ordenamos por menor precio y limitamos a 1
  if (buscaMasBarato) {
    finalPool.sort(
      (a, b) => obtenerPrecioEfectivo(a.row) - obtenerPrecioEfectivo(b.row)
    );
    return finalPool.slice(0, 1).map(item => item.row);
  }

  finalPool.sort((a, b) => b.score - a.score);

  return finalPool.slice(0, MAX_PRODUCTS_FOR_PROMPT).map(item => item.row);
}

/**
 * Formatea cada fila de producto en un string de texto plano con la estructura obligatoria:
 * - [Nombre del producto y presentación] - Precio: $[Precio]
 * Prohibido pasar objetos crudos, marcas redundantes o códigos internos.
 */
function formatearProductoEnTextoPlano(row: ProductRow): string {
  let nombreProducto = limpiarTextoBasura(String(row.title || 'Producto disponible'));

  const formato = typeof row.format === 'string' ? limpiarTextoBasura(row.format) : '';
  if (
    formato &&
    formato.toLowerCase() !== 'estándar' &&
    formato.toLowerCase() !== 'estandar' &&
    !nombreProducto.toLowerCase().includes(formato.toLowerCase())
  ) {
    nombreProducto = `${nombreProducto} ${formato}`.trim();
  } else if (Array.isArray(row.options) && row.options.length > 0) {
    const presentacionesConStock: string[] = [];

    for (const opt of row.options) {
      if (typeof opt === 'string') {
        const cleanName = limpiarTextoBasura(opt);
        if (cleanName) presentacionesConStock.push(cleanName);
      } else if (opt && typeof opt === 'object') {
        const optRecord = opt as Record<string, unknown>;
        const optStock = optRecord.stock !== undefined ? Number(optRecord.stock) : 1;
        if (!Number.isNaN(optStock) && optStock <= 0) continue;

        const rawName =
          typeof optRecord.name === 'string'
            ? optRecord.name
            : typeof optRecord.label === 'string'
              ? optRecord.label
              : '';
        const cleanName = limpiarTextoBasura(rawName);
        if (cleanName) presentacionesConStock.push(cleanName);
      }
    }

    const presentacionesValidas = presentacionesConStock.filter(
      name =>
        name.toLowerCase() !== 'estándar' &&
        name.toLowerCase() !== 'estandar' &&
        !nombreProducto.toLowerCase().includes(name.toLowerCase())
    );

    if (presentacionesValidas.length > 0) {
      nombreProducto = `${nombreProducto} (${presentacionesValidas.join(' / ')})`.trim();
    }
  }

  const finalPrice = obtenerPrecioEfectivo(row);
  const precioFormateado = Math.round(finalPrice).toLocaleString('es-AR');

  return `- ${nombreProducto} - Precio: $${precioFormateado}`;
}

function limpiarEtiquetasRespuesta(texto: string): string {
  return texto
    .replace(/\[object\s+Object\]/gi, '')
    .replace(/^\s*Pregunta\s*:\s*.*(?:\r?\n|$)/gim, '')
    .replace(/^\s*Respuesta\s*:\s*/gim, '')
    .replace(/insumo\s+oficial\s+cultishop\s*[-–—:]?\s*c[oó]digo\s*\d+/gi, '')
    .replace(/\bc[oó]digo\s*(?:interno|id|#|:)?\s*\d+\b/gi, '')
    .replace(/\s*\|\s*Marca\s*:\s*[^\r\n]+/gi, '')
    .replace(
      /^(?:¡?hola!?[,.]?\s*)?(?:me encantaria ayudarte|con gusto te ayudo|estaria encantado de ayudarte)[^.\n]*[.\n:]\s*/i,
      '¡Hola! Aquí tienes las opciones disponibles:\n'
    )
    .trim();
}

/**
 * Construye una respuesta institucional precisa sin consultar ni mezclar productos.
 */
function construirRespuestaInstitucionalDirecta(mensaje: string): string {
  const norm = normalizeText(mensaje);
  const preguntaHorario = /\b(horario|horarios|atienden|atencion|abren|abierto|cierran|hora|sabado|sabados|domingo|domingos)\b/.test(norm);
  const preguntaDireccion = /\b(direccion|ubicacion|ubicado|ubicada|ubicados|ubicadas|donde queda|donde quedan|donde estan|donde se encuentran|como llegar|como llego|como voy|como ir|local|local fisico|tienda|tienda fisica|negocio|sucursal|punto de venta|calle|domicilio|altura|zona|barrio|posadas|misiones|acarium|acuarium|lopez y planes|lavalle|mapa|maps|google maps)\b/.test(norm);
  const preguntaEnvio = /\b(envio|envios|interior|pais|mandados|correo argentino|via cargo)\b/.test(norm);
  const preguntaPagos = /\b(pago|pagos|pagar|abonar|abonan|medio de pago|medios de pago|forma de pago|formas de pago|tarjeta|tarjetas|credito|debito|efectivo|transferencia|transferencias)\b/.test(norm);

  const partes: string[] = [];

  if (preguntaDireccion) {
    partes.push(`Nuestro local de CultiShop está ubicado en **${INSTITUTIONAL_DATA.direccion}**`);
  }
  if (preguntaHorario) {
    partes.push(`Atendemos de **${INSTITUTIONAL_DATA.horarios}**`);
  }
  if (preguntaEnvio) {
    partes.push(`Realizamos envíos **${INSTITUTIONAL_DATA.envios.toLowerCase()}**`);
  }
  if (preguntaPagos) {
    partes.push(`Aceptamos **${INSTITUTIONAL_DATA.pagos}**`);
  }

  if (partes.length === 0) {
    return `¡Hola! En CultiShop estamos en **${INSTITUTIONAL_DATA.direccion}** Atendemos de **${INSTITUTIONAL_DATA.horarios}** y hacemos envíos **${INSTITUTIONAL_DATA.envios.toLowerCase()}** Aceptamos **${INSTITUTIONAL_DATA.pagos}**`;
  }

  return `¡Hola! ${partes.join(' ')} ¿Te puedo ayudar con algo más?`;
}

/**
 * Verifica si la respuesta de Ollama ante una búsqueda de productos con resultados
 * falló en el formato, evadió la respuesta o inventó que no hay stock.
 */
function respuestaDeProductosEsInvalida(respuesta: string, buscaMasBarato: boolean): boolean {
  const norm = normalizeText(respuesta);
  const evade =
    /\b(no tengo acceso|no puedo acceder|consulte la web|consulta la web|visite la web|visita nuestra web|no dispongo de informacion|no hay|no tenemos|no contamos|sin stock|agotado|agotados|no disponemos|no encontre)\b/.test(
      norm
    );
  const tieneFormatoDePrecio = /-\s+.+\s+-\s+Precio:\s*\$/i.test(respuesta);

  if (evade || !tieneFormatoDePrecio) {
    return true;
  }

  // Si pidió el más barato, verificar que solo se muestre 1 producto
  if (buscaMasBarato) {
    const matches = respuesta.match(/-\s+.+\s+-\s+Precio:\s*\$/gi);
    if (!matches || matches.length !== 1) {
      return true;
    }
  }

  return false;
}

interface N8nWebhookResponse {
  reply?: string;
  respuesta?: string;
  sessionId?: string;
}

async function callN8nChatbotWebhook(
  mensaje: string,
  sessionId: string
): Promise<string | null> {
  if (process.env.USE_N8N_CHATBOT === 'false' || !N8N_CHATBOT_WEBHOOK_URL) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(N8N_CHATBOT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: mensaje, sessionId }),
      signal: controller.signal
    });

    if (!response.ok) {
      console.warn('[Chatbot] n8n webhook devolvió HTTP', response.status);
      return null;
    }

    const data = (await response.json()) as N8nWebhookResponse;
    const reply = (data.reply || data.respuesta || '').trim();
    return reply || null;
  } catch (err) {
    console.warn('[Chatbot] Falló llamada a n8n webhook, usando fallback local:', err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getChatbotResponse(
  mensaje: string,
  sessionId = 'guest_anon'
): Promise<string> {
  try {
    const n8nReply = await callN8nChatbotWebhook(mensaje, sessionId);
    if (n8nReply) {
      return n8nReply;
    }

    const searchPatterns = getProductSearchPatterns(mensaje);
    const categorySearchPatterns = getCategorySearchPatterns(mensaje);
    const buscaMasBarato = esConsultaPorMasBarato(mensaje);
    const intent = classifyUserIntent(mensaje, categorySearchPatterns);

    console.log('[Chatbot] Intención clasificada:', {
      intent,
      cheapestQuery: buscaMasBarato,
      searchPatternsCount: searchPatterns.length
    });

    // =========================================================================
    // RUTA 1: SALUDOS SIMPLES (Retorno inmediato sin consultar PostgreSQL)
    // =========================================================================
    if (intent === 'GREETING') {
      return GREETING_RESPONSE;
    }

    // =========================================================================
    // RUTA 2: PREGUNTAS INSTITUCIONALES (Sin consultar productos en PostgreSQL)
    // =========================================================================
    if (intent === 'INSTITUTIONAL') {
      return construirRespuestaInstitucionalDirecta(mensaje);
    }

    // =========================================================================
    // RUTA 3: BÚSQUEDA DE PRODUCTOS EN POSTGRESQL (Solo stock > 0)
    // Si busca "el más barato" / "económico", ordena por precio ASC y limita a 1.
    // =========================================================================
    const sqlLimit = buscaMasBarato ? 1 : SQL_CANDIDATE_LIMIT;

    const productsResult = await pool.query<ProductRow>(`
      SELECT
        p.title,
        p.brand,
        p.format,
        p.price,
        p.discount_price,
        p.stock,
        p.options,
        CASE
          WHEN category.parent_id IS NOT NULL THEN parent_category.name
          WHEN category.name IS NOT NULL THEN category.name
          ELSE subcategory_parent.name
        END AS category_name,
        CASE
          WHEN category.parent_id IS NOT NULL THEN category.name
          ELSE subcategory.name
        END AS subcategory_name
      FROM products p
      LEFT JOIN categories category ON p.category_id = category.id
      LEFT JOIN categories parent_category ON category.parent_id = parent_category.id
      LEFT JOIN categories subcategory ON p.subcategory_id = subcategory.id
      LEFT JOIN categories subcategory_parent ON subcategory.parent_id = subcategory_parent.id
      WHERE p.is_active = TRUE
        AND p.stock > 0
        AND (
          cardinality($1::text[]) = 0
          OR concat_ws(
            ' ',
            p.title,
            category.name,
            parent_category.name,
            subcategory.name,
            subcategory_parent.name
          ) ILIKE ANY($1::text[])
          OR (
            cardinality($3::text[]) > 0
            AND concat_ws(
              ' ',
              category.name,
              parent_category.name,
              subcategory.name,
              subcategory_parent.name
            ) ILIKE ANY($3::text[])
          )
        )
        AND (
          cardinality($3::text[]) = 0
          OR NOT (
            concat_ws(
              ' ',
              p.title,
              category.name,
              parent_category.name,
              subcategory.name,
              subcategory_parent.name
            ) ILIKE ANY($4::text[])
          )
        )
      ORDER BY
        CASE
          WHEN $5::boolean = TRUE THEN
            CASE
              WHEN p.discount_price IS NOT NULL AND p.discount_price > 0 AND p.discount_price < p.price
              THEN p.discount_price
              ELSE p.price
            END
          ELSE NULL
        END ASC NULLS LAST,
        CASE
          WHEN cardinality($1::text[]) > 0
            AND p.title ILIKE ANY($1::text[])
          THEN 0
          WHEN cardinality($1::text[]) > 0
            AND concat_ws(
              ' ',
              p.title,
              category.name,
              subcategory.name
            ) ILIKE ANY($1::text[])
          THEN 1
          ELSE 2
        END,
        p.is_featured DESC,
        category_name NULLS LAST,
        p.title
      LIMIT $2
    `, [
      searchPatterns,
      sqlLimit,
      categorySearchPatterns,
      ['%humedad%', '%humidity%', '%control ambiental%', '%curado%'],
      buscaMasBarato
    ]);

    const rowsWithStock = productsResult.rows.filter(row => Number(row.stock) > 0);
    const topRelevantRows = filtrarYOrdenarPorPrecision(rowsWithStock, mensaje, buscaMasBarato);
    const formattedProductLines = topRelevantRows.map(formatearProductoEnTextoPlano);

    console.log('[Chatbot] Productos con stock formateados en texto plano:', {
      productCount: formattedProductLines.length,
      cheapestOnly: buscaMasBarato,
      limit: buscaMasBarato ? 1 : MAX_PRODUCTS_FOR_PROMPT
    });

    if (formattedProductLines.length === 0) {
      return '¡Hola! Por el momento no contamos con stock disponible de ese artículo específico. ¿Te gustaría consultar por otra categoría o insumo de CultiShop?';
    }

    const productContext = formattedProductLines.join('\n');
    const defaultProductHeader = buscaMasBarato
      ? '¡Hola! La opción más económica disponible en CultiShop es:'
      : '¡Hola! Aquí tienes las opciones disponibles en CultiShop:';

    const productPrompt = `
Eres Culti, el asistente experto de la tienda CultiShop.
Tienes acceso confirmado a los siguientes productos en stock real de CultiShop.

REGLAS ESTRICTAS DE SALIDA:
1. CONFIANZA TOTAL EN LOS DATOS: Usa únicamente la lista de abajo para responder con total seguridad. Está PROHIBIDO decir "no tengo acceso a datos", "consulte la web" o "no hay stock".
2. FORMATO OBLIGATORIO DE PRODUCTOS: Muestra ${buscaMasBarato ? 'únicamente el producto más barato de la lista' : 'los productos de la lista'} copiando exactamente cada línea con este formato:
   - [Nombre del producto y presentación] - Precio: $[Precio]
   (Sin agregar marcas, códigos internos ni textos extraños).
3. BREVEDAD Y CLARIDAD: Comienza con "${defaultProductHeader}" seguido inmediatamente de la línea del producto. No escribas "Pregunta:" ni "Respuesta:".

Productos disponibles en stock:
${productContext}

Pregunta: ${mensaje}

Respuesta:
`.trim();

    console.log('[Chatbot] Enviando solicitud de productos a Ollama (qwen2.5:0.5b).');
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: productPrompt,
        stream: false,
        options: {
          temperature: 0.1,
          top_p: 0.9,
          num_predict: 250
        }
      })
    });

    if (!response.ok) {
      return `${defaultProductHeader}\n\n${productContext}`;
    }

    const responseBody = (await response.json()) as OllamaGenerateResponse;
    let answer = responseBody.response
      ? limpiarEtiquetasRespuesta(responseBody.response)
      : '';

    // Validación final de integridad: si el modelo de 0.5B alteró el formato obligatorio,
    // mostró más de 1 opción cuando se pidió el más barato o evadió los datos, entregamos el resultado exacto.
    if (!answer || respuestaDeProductosEsInvalida(answer, buscaMasBarato)) {
      answer = `${defaultProductHeader}\n\n${productContext}`;
    }

    console.log('[Chatbot] Respuesta recibida de Ollama.', {
      model: OLLAMA_MODEL,
      responseTextLength: answer.length
    });

    return answer;
  } catch (error) {
    console.error('Error en el servicio de chatbot local:', error);
    return FALLBACK_RESPONSE;
  }
}
