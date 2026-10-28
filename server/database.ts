import mongoose, { Schema } from "mongoose";
import mysql, { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { Repositories } from "./repositories";
import { Product, Order } from "./contracts";
import { HttpError } from "./errors";
import { readConfig } from "./config";
export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS Users (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, username VARCHAR(40) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS Orders (orderId INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, userId INT UNSIGNED NOT NULL, productIds JSON NOT NULL, totalAmount DECIMAL(14,2) NOT NULL, CONSTRAINT fk_order_user FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE RESTRICT, INDEX idx_orders_user (userId)) ENGINE=InnoDB`,
];
export async function initialize(pool: Pool) {
  for (const statement of schemaStatements) await pool.query(statement);
}
interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  password: string;
}
interface OrderRow extends RowDataPacket {
  orderId: number;
  userId: number;
  productIds: string[] | string;
  totalAmount: string | number;
}
function order(row: OrderRow): Order {
  return {
    orderId: row.orderId,
    userId: row.userId,
    productIds:
      typeof row.productIds === "string"
        ? JSON.parse(row.productIds)
        : row.productIds,
    totalAmount: Number(row.totalAmount),
  };
}
export async function connectDatabases(config: ReturnType<typeof readConfig>) {
  const connection = await mongoose
    .createConnection(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    .asPromise();
  const pool = mysql.createPool({
    host: config.MYSQL_HOST,
    port: config.MYSQL_PORT,
    user: config.MYSQL_USER,
    password: config.MYSQL_PASSWORD,
    database: config.MYSQL_DATABASE,
    connectionLimit: 5,
    connectTimeout: 5000,
    decimalNumbers: true,
  });
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    await connection.close();
    await pool.end();
    throw error;
  }
  const model = connection.model(
    "Product",
    new Schema<{ name: string; price: number; description: string }>(
      {
        name: { type: String, required: true, trim: true, maxlength: 120 },
        price: { type: Number, required: true, min: 0, max: 1000000 },
        description: { type: String, default: "", maxlength: 2000 },
      },
      { versionKey: false },
    ),
  );
  const product = (p: {
    _id: mongoose.Types.ObjectId;
    name: string;
    price: number;
    description: string;
  }): Product => ({
    id: p._id.toHexString(),
    name: p.name,
    price: p.price,
    description: p.description,
  });
  const findOrder = async (id: number, userId: number) => {
    const [rows] = await pool.execute<OrderRow[]>(
      "SELECT orderId,userId,productIds,totalAmount FROM Orders WHERE orderId=? AND userId=?",
      [id, userId],
    );
    return rows[0] ? order(rows[0]) : null;
  };
  const repos: Repositories = {
    products: {
      async list() {
        return (await model.find().sort({ name: 1, _id: 1 }).lean()).map(
          product,
        );
      },
      async find(id) {
        const p = await model.findById(id).lean();
        return p ? product(p) : null;
      },
      async create(p) {
        return product(await model.create(p));
      },
      async update(id, p) {
        const row = await model
          .findByIdAndUpdate(id, p, {
            returnDocument: "after",
            runValidators: true,
          })
          .lean();
        return row ? product(row) : null;
      },
      async delete(id) {
        return (await model.deleteOne({ _id: id })).deletedCount === 1;
      },
    },
    users: {
      async findByName(name) {
        const [rows] = await pool.execute<UserRow[]>(
          "SELECT id,username,password FROM Users WHERE username=?",
          [name],
        );
        return rows[0] ?? null;
      },
      async findById(id) {
        const [rows] = await pool.execute<UserRow[]>(
          "SELECT id,username FROM Users WHERE id=?",
          [id],
        );
        return rows[0] ? { id: rows[0].id, username: rows[0].username } : null;
      },
      async create(name, hash) {
        try {
          const [result] = await pool.execute<ResultSetHeader>(
            "INSERT INTO Users(username,password) VALUES(?,?)",
            [name, hash],
          );
          return { id: result.insertId, username: name };
        } catch (error) {
          if (
            typeof error === "object" &&
            error &&
            "code" in error &&
            error.code === "ER_DUP_ENTRY"
          )
            throw new HttpError(409, "Username already exists.");
          throw error;
        }
      },
    },
    orders: {
      async list(userId) {
        const [rows] = await pool.execute<OrderRow[]>(
          "SELECT orderId,userId,productIds,totalAmount FROM Orders WHERE userId=? ORDER BY orderId DESC",
          [userId],
        );
        return rows.map(order);
      },
      find: findOrder,
      async create(userId, ids, total) {
        const [result] = await pool.execute<ResultSetHeader>(
          "INSERT INTO Orders(userId,productIds,totalAmount) VALUES(?,?,?)",
          [userId, JSON.stringify(ids), total],
        );
        return {
          orderId: result.insertId,
          userId,
          productIds: ids,
          totalAmount: total,
        };
      },
      async update(id, userId, ids, total) {
        const [result] = await pool.execute<ResultSetHeader>(
          "UPDATE Orders SET productIds=?,totalAmount=? WHERE orderId=? AND userId=?",
          [JSON.stringify(ids), total, id, userId],
        );
        return result.affectedRows ? findOrder(id, userId) : null;
      },
      async delete(id, userId) {
        const [result] = await pool.execute<ResultSetHeader>(
          "DELETE FROM Orders WHERE orderId=? AND userId=?",
          [id, userId],
        );
        return result.affectedRows === 1;
      },
      async referencesProduct(id) {
        const [rows] = await pool.execute<RowDataPacket[]>(
          "SELECT orderId FROM Orders WHERE JSON_CONTAINS(productIds,JSON_QUOTE(?)) LIMIT 1",
          [id],
        );
        return rows.length > 0;
      },
    },
    async health() {
      try {
        await pool.query("SELECT 1");
        return connection.readyState === 1;
      } catch {
        return false;
      }
    },
  };
  return {
    repos,
    pool,
    connection,
    async close() {
      await Promise.all([pool.end(), connection.close()]);
    },
  };
}
