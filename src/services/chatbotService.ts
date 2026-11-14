import { pool } from '../config/database';

const FALLBACK_RESPONSE =
  'Lo siento, en este momento no puedo consultar esa información. Por favor, inténtalo nuevamente en unos minutos o contacta al equipo de CultiShop.';

interface ProductRow {
  title: string;
  description: string | null;
  price: string;
  discount_price: string | null;
  stock: number;
  options: unknown;
  category_name: string | null;
  subcategory_name: string | null;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

export async function getChatbotResponse(mensaje: string): Promise<string> {
  try {
    const productsResult = await pool.query<ProductRow>(`
      SELECT
        p.title,
        p.description,
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
      ORDER BY category_name NULLS LAST, p.title
    `);

    const productContext = productsResult.rows.length
      ? JSON.stringify(productsResult.rows)
      : 'No hay productos activos disponibles en este momento.';

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('La variable de entorno GEMINI_API_KEY no está configurada.');
    }

    const systemPrompt = `
Eres el asistente virtual de CultiShop, una tienda de productos e insumos para cultivo.
Responde en español, con un tono amable, claro y profesional.
Usa el catálogo proporcionado como fuente de verdad para nombres, categorías, precios,
disponibilidad y características de productos. No inventes productos, precios, stock,
descuentos ni políticas de envío, pago o devolución. Si un dato no figura en el contexto,
indica amablemente que no puedes confirmarlo y recomienda consultar al equipo de CultiShop.
Considera las variantes de producto si aparecen en "options". El stock cero significa que
el producto no está disponible. Si preguntan algo ajeno a la tienda, responde brevemente
que puedes ayudar con consultas sobre CultiShop y su catálogo.

Catálogo actual de productos activos:
${productContext}
`.trim();

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const apiUrl = new URL(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
    );
    apiUrl.searchParams.set('key', apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: mensaje }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 512 }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini respondió con estado HTTP ${response.status}.`);
      }

      const result = (await response.json()) as GeminiResponse;
      const answer = result.candidates?.[0]?.content?.parts
        ?.map(part => part.text || '')
        .join('')
        .trim();

      if (!answer) {
        throw new Error('Gemini no devolvió una respuesta de texto.');
      }

      return answer;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error('Error en el servicio de chatbot:', error);
    return FALLBACK_RESPONSE;
  }
}
