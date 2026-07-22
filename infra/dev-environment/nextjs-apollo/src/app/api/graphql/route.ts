import { startServerAndCreateNextHandler } from "@as-integrations/next";
import { ApolloServer } from "@apollo/server";
import { NextRequest } from "next/server";
import db from "@/lib/db";
import { createClient } from "redis";

const resolvers = {
  Query: {
    health: async () => {
      const pgResult = await db.query("SELECT NOW() as time");
      const redisClient = await createClient({ url: process.env.REDIS_URL })
        .connect();
      const pong = await redisClient.ping();
      await redisClient.disconnect();

      return JSON.stringify({
        postgres: pgResult.rows[0].time,
        redis: pong,
        status: "ok",
      });
    },
    timestamp: () => new Date().toISOString(),
  },
};

const server = new ApolloServer({
  typeDefs: `
    type Query {
      health: String
      timestamp: String
    }
  `,
  resolvers,
});

const handler = startServerAndCreateNextHandler<NextRequest>(server);

export async function GET(request: NextRequest) {
  return handler(request);
}

export async function POST(request: NextRequest) {
  return handler(request);
}
