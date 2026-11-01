import { Request, Response } from 'express';
import { pool } from '../config/database';

/**
 * Endpoint optimizado para el panel de administración
 * GET /api/admin/stats o GET /api/admin/summary
 * 
 * Ejecuta consultas SQL ultraligeras de conteo (COUNT)
 * sin transferir colecciones completas ni payloads pesados.
 */
export const getAdminStats = async (req: Request, res: Response) => {
  try {
    // Consulta SQL unificada con subconsultas escalares en un único viaje a PostgreSQL
    const unifiedQuery = `
      SELECT
        (SELECT COUNT(*)::int FROM products) AS total_products,
        (SELECT COUNT(*)::int FROM products WHERE stock <= 5) AS low_stock_products,
        (SELECT COUNT(*)::int FROM orders) AS total_orders,
        (SELECT COUNT(*)::int FROM orders WHERE status = 'pending') AS pending_orders,
        (SELECT COUNT(*)::int FROM banners) AS total_banners,
        (SELECT COUNT(*)::int FROM banners WHERE is_active = true) AS active_banners,
        (SELECT COUNT(*)::int FROM categories) AS total_categories,
        (SELECT COUNT(*)::int FROM about_sections) AS total_about_sections,
        (SELECT COUNT(*)::int FROM instagram_videos) AS total_instagram_videos,
        (SELECT COUNT(*)::int FROM faqs) AS total_faqs;
    `;

    const result = await pool.query(unifiedQuery);
    const row = result.rows[0] || {};

    const totalProducts = parseInt(row.total_products, 10) || 0;
    const lowStockProducts = parseInt(row.low_stock_products, 10) || 0;
    const totalOrders = parseInt(row.total_orders, 10) || 0;
    const pendingOrders = parseInt(row.pending_orders, 10) || 0;
    const totalBanners = parseInt(row.total_banners, 10) || 0;
    const activeBanners = parseInt(row.active_banners, 10) || 0;
    const totalCategories = parseInt(row.total_categories, 10) || 0;
    const totalAboutSections = parseInt(row.total_about_sections, 10) || 0;
    const totalInstagramVideos = parseInt(row.total_instagram_videos, 10) || 0;
    const totalInstitutional = totalAboutSections + totalInstagramVideos;
    const totalFaqs = parseInt(row.total_faqs, 10) || 0;

    const stats = {
      totalProducts,
      lowStockProducts,
      totalOrders,
      pendingOrders,
      totalBanners,
      activeBanners,
      totalCategories,
      totalAboutSections,
      totalInstagramVideos,
      totalInstitutional,
      totalFaqs
    };

    return res.status(200).json({
      success: true,
      stats,
      // Acceso directo a nivel raíz para máxima flexibilidad en el cliente
      ...stats
    });
  } catch (error: any) {
    console.error('[AdminStats] Error en consulta unificada de estadísticas:', error?.message || error);

    // Fallback de alta disponibilidad: consultar tablas individualmente de forma segura
    try {
      const safeCount = async (table: string, whereClause = ''): Promise<number> => {
        try {
          const sql = `SELECT COUNT(*)::int AS count FROM ${table} ${whereClause ? `WHERE ${whereClause}` : ''};`;
          const r = await pool.query(sql);
          return parseInt(r.rows[0]?.count, 10) || 0;
        } catch {
          return 0;
        }
      };

      const [
        totalProducts,
        lowStockProducts,
        totalOrders,
        pendingOrders,
        totalBanners,
        activeBanners,
        totalCategories,
        totalAboutSections,
        totalInstagramVideos,
        totalFaqs
      ] = await Promise.all([
        safeCount('products'),
        safeCount('products', 'stock <= 5'),
        safeCount('orders'),
        safeCount('orders', "status = 'pending'"),
        safeCount('banners'),
        safeCount('banners', 'is_active = true'),
        safeCount('categories'),
        safeCount('about_sections'),
        safeCount('instagram_videos'),
        safeCount('faqs')
      ]);

      const totalInstitutional = totalAboutSections + totalInstagramVideos;

      const fallbackStats = {
        totalProducts,
        lowStockProducts,
        totalOrders,
        pendingOrders,
        totalBanners,
        activeBanners,
        totalCategories,
        totalAboutSections,
        totalInstagramVideos,
        totalInstitutional,
        totalFaqs
      };

      return res.status(200).json({
        success: true,
        stats: fallbackStats,
        ...fallbackStats
      });
    } catch (fallbackError: any) {
      console.error('[AdminStats] Error crítico en fallback de estadísticas:', fallbackError?.message || fallbackError);
      return res.status(500).json({
        error: 'No se pudieron calcular las estadísticas del panel de administración.',
        details: fallbackError?.message
      });
    }
  }
};

