import { Request, Response } from 'express';
import { pool } from '../config/database';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

/**
 * Crear un nuevo pedido (realizado por un consumidor)
 */
export const createOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || null;
    const {
      customer_name,
      customer_email,
      whatsapp_phone,
      shipping_address,
      notes,
      items = [],
      total_amount
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'El pedido debe contener al menos un producto.' });
    }

    const calculatedTotal = total_amount 
      ? parseFloat(total_amount) 
      : items.reduce((acc: number, item: any) => acc + (parseFloat(item.unitPrice || item.price || 0) * (item.quantity || 1)), 0);

    const clientName = customer_name || req.user?.name || 'Cliente CultiShop';
    const clientEmail = customer_email || req.user?.email || null;
    const itemsJson = JSON.stringify(items);

    const orderResult = await pool.query(`
      INSERT INTO orders (
        user_id, 
        customer_name, 
        customer_email, 
        whatsapp_phone, 
        shipping_address, 
        notes, 
        items, 
        total_amount, 
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
      RETURNING *
    `, [
      userId,
      clientName,
      clientEmail,
      whatsapp_phone || null,
      shipping_address || null,
      notes || null,
      itemsJson,
      calculatedTotal
    ]);

    const newOrder = orderResult.rows[0];

    // Opcionalmente registrar en order_items si los product_id son numéricos válidos
    try {
      for (const it of items) {
        if (it.productId || it.id) {
          const pId = it.productId || it.id;
          if (typeof pId === 'number') {
            await pool.query(`
              INSERT INTO order_items (order_id, product_id, quantity, unit_price, selected_option)
              VALUES ($1, $2, $3, $4, $5)
            `, [
              newOrder.id,
              pId,
              it.quantity || 1,
              parseFloat(it.unitPrice || it.price || 0),
              it.selectedOption || it.option || 'Estándar'
            ]);
          }
        }
      }
    } catch (itemErr) {
      console.warn('Advertencia al insertar en order_items:', itemErr);
    }

    return res.status(201).json({
      message: '¡Pedido registrado exitosamente!',
      order: {
        ...newOrder,
        items: typeof newOrder.items === 'string' ? JSON.parse(newOrder.items) : newOrder.items
      }
    });
  } catch (error: any) {
    console.error('Error en createOrder:', error);
    return res.status(500).json({ error: error.message || 'Error al procesar el pedido.' });
  }
};

/**
 * Obtener todos los pedidos (Solo Admin)
 */
export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        o.id,
        o.user_id,
        COALESCE(o.customer_name, u.name, 'Cliente') as customer_name,
        COALESCE(o.customer_email, u.email, 'Sin email') as customer_email,
        o.whatsapp_phone,
        o.shipping_address,
        o.notes,
        o.items,
        o.total_amount,
        o.status,
        o.created_at,
        o.updated_at
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
    `);

    const orders = result.rows.map(row => ({
      ...row,
      total_amount: typeof row.total_amount === 'number' ? row.total_amount : parseFloat(row.total_amount) || 0,
      items: typeof row.items === 'string' ? JSON.parse(row.items || '[]') : (row.items || [])
    }));

    return res.json({ orders });
  } catch (error: any) {
    console.error('Error en getAllOrders:', error);
    return res.status(500).json({ error: 'Error al obtener el listado de pedidos.' });
  }
};

/**
 * Obtener los pedidos del usuario autenticado
 */
export const getMyOrders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userEmail = req.user?.email?.toLowerCase();

    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado.' });
    }

    const result = await pool.query(`
      SELECT * FROM orders 
      WHERE user_id = $1 OR LOWER(customer_email) = $2
      ORDER BY created_at DESC
    `, [userId, userEmail]);

    const orders = result.rows.map(row => ({
      ...row,
      total_amount: typeof row.total_amount === 'number' ? row.total_amount : parseFloat(row.total_amount) || 0,
      items: typeof row.items === 'string' ? JSON.parse(row.items || '[]') : (row.items || [])
    }));

    return res.json({ orders });
  } catch (error: any) {
    console.error('Error en getMyOrders:', error);
    return res.status(500).json({ error: 'Error al obtener tus pedidos.' });
  }
};

/**
 * Cambiar el estado de un pedido (Solo Admin)
 */
export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'delivered', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Estado inválido. Los estados permitidos son: ${validStatuses.join(', ')}.` 
      });
    }

    const check = await pool.query('SELECT id FROM orders WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    const updateResult = await pool.query(`
      UPDATE orders 
      SET status = $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING *
    `, [status, id]);

    const updated = updateResult.rows[0];

    return res.json({
      message: `Estado del pedido #${id} actualizado a "${status}".`,
      order: {
        ...updated,
        items: typeof updated.items === 'string' ? JSON.parse(updated.items || '[]') : (updated.items || [])
      }
    });
  } catch (error: any) {
    console.error('Error en updateOrderStatus:', error);
    return res.status(500).json({ error: 'Error al actualizar el estado del pedido.' });
  }
};

/**
 * Eliminar pedido (Solo Admin)
 */
export const deleteOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const check = await pool.query('SELECT id FROM orders WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    await pool.query('DELETE FROM orders WHERE id = $1', [id]);

    return res.json({ message: `Pedido #${id} eliminado correctamente.` });
  } catch (error: any) {
    console.error('Error en deleteOrder:', error);
    return res.status(500).json({ error: 'Error al eliminar el pedido.' });
  }
};
