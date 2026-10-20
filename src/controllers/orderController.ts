import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

const JWT_SECRET = process.env.JWT_SECRET || 'cultishop_secret_jwt_token_2026';

/**
 * Crear un nuevo pedido (realizado por un consumidor o invitado)
 */
export const createOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    let userId = req.user?.id || null;
    let authUser = req.user || null;
    let authToken: string | null = null;

    const {
      customer_name,
      customer_email,
      phone,
      whatsapp_phone,
      country = 'Argentina',
      street_address,
      apartment,
      city,
      state,
      postal_code,
      payment_method = 'transferencia',
      shipping_method = 'retiro_local',
      shipping_address,
      notes,
      items = [],
      total_amount,
      create_account,
      password
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'El pedido debe contener al menos un producto.' });
    }

    const clientName = customer_name ? customer_name.trim() : (req.user?.name || 'Cliente CultiShop');
    const clientEmail = customer_email ? customer_email.trim().toLowerCase() : (req.user?.email || null);
    const clientPhone = phone || whatsapp_phone || null;

    // Si el usuario marcó "¿Crear una cuenta?" y no está logueado
    if (!userId && create_account && password && clientEmail) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña para crear la cuenta debe tener al menos 6 caracteres.' });
      }

      // Verificar si ya existe un usuario con este correo
      const existingUser = await pool.query(
        'SELECT id, name, email, role, is_adult FROM users WHERE LOWER(email) = $1',
        [clientEmail]
      );

      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].id;
        authUser = existingUser.rows[0];
      } else {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const role = 'consumidor';

        const newUserResult = await pool.query(`
          INSERT INTO users (name, email, password, role, is_adult, is_verified)
          VALUES ($1, $2, $3, $4, true, true)
          RETURNING id, name, email, role, is_adult, created_at
        `, [clientName, clientEmail, hashedPassword, role]);

        const newUser = newUserResult.rows[0];
        authUser = newUser;
        userId = newUser.id;

        authToken = jwt.sign(
          { id: newUser.id, email: newUser.email, role: newUser.role },
          JWT_SECRET,
          { expiresIn: '7d' }
        );
      }
    }

    const calculatedTotal = total_amount 
      ? parseFloat(total_amount) 
      : items.reduce((acc: number, item: any) => acc + (parseFloat(item.unitPrice || item.price || 0) * (item.quantity || 1)), 0);

    // Formatear dirección limpia y consolidada
    const formattedAddress = street_address 
      ? `${street_address}${apartment ? ', Depto/Piso: ' + apartment : ''}, ${city || ''}, ${state || ''} (CP: ${postal_code || ''}), ${country}`
      : (shipping_address || 'Retiro en Local Oficial (Posadas)');

    const itemsJson = JSON.stringify(items);

    const orderResult = await pool.query(`
      INSERT INTO orders (
        user_id, 
        customer_name, 
        customer_email, 
        whatsapp_phone, 
        phone,
        country,
        street_address,
        apartment,
        city,
        state,
        postal_code,
        payment_method,
        shipping_method,
        shipping_address, 
        notes, 
        items, 
        total_amount, 
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'pending')
      RETURNING *
    `, [
      userId,
      clientName,
      clientEmail,
      clientPhone,
      clientPhone,
      country || 'Argentina',
      street_address || null,
      apartment || null,
      city || null,
      state || null,
      postal_code || null,
      payment_method,
      shipping_method,
      formattedAddress,
      notes || null,
      itemsJson,
      calculatedTotal
    ]);

    const newOrder = orderResult.rows[0];

    // Opcionalmente registrar en order_items si los product_id son numéricos válidos
    try {
      for (const it of items) {
        const pId = it.productId || it.id;
        if (pId && typeof pId === 'number') {
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
    } catch (itemErr) {
      console.warn('Advertencia al insertar en order_items:', itemErr);
    }

    return res.status(201).json({
      message: '¡Pedido registrado exitosamente!',
      order: {
        ...newOrder,
        items: typeof newOrder.items === 'string' ? JSON.parse(newOrder.items) : newOrder.items
      },
      token: authToken,
      user: authUser
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
        COALESCE(o.whatsapp_phone, o.phone) as whatsapp_phone,
        o.phone,
        o.country,
        o.street_address,
        o.apartment,
        o.city,
        o.state,
        o.postal_code,
        o.payment_method,
        o.shipping_method,
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
    const authId = req.user?.id;
    const authEmail = req.user?.email?.toLowerCase();
    const authRole = req.user?.role;

    if (!authId) {
      return res.status(401).json({ error: 'Usuario no autenticado.' });
    }

    // Si se especifica un :userId en los parámetros, solo el admin puede consultar de otros
    let targetUserId = authId;
    if (req.params?.userId) {
      const paramId = parseInt(req.params.userId, 10);
      if (!isNaN(paramId)) {
        if (authRole === 'admin' || paramId === authId) {
          targetUserId = paramId;
        }
      }
    }

    const result = await pool.query(`
      SELECT * FROM orders 
      WHERE user_id = $1 OR (customer_email IS NOT NULL AND LOWER(customer_email) = $2)
      ORDER BY id DESC, created_at DESC
    `, [targetUserId, authEmail]);

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
