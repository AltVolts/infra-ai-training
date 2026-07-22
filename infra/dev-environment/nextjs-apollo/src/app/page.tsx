"use client";

import { ApolloProvider, gql, useQuery } from "@apollo/client";
import client from "@/lib/apollo-client";

const GET_HEALTH = gql`
  query Health {
    health
    timestamp
  }
`;

function HealthCheck() {
  const { loading, error, data } = useQuery(GET_HEALTH);

  if (loading) return <p>Загрузка...</p>;
  if (error) return <p>Ошибка: {error.message}</p>;

  return (
    <div>
      <h2>Состояние сервисов</h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

export default function Home() {
  return (
    <ApolloProvider client={client}>
      <main style={{ padding: "2rem", fontFamily: "monospace" }}>
        <h1>Platform — Контейнеризированная разработка</h1>
        <p>Next.js + Apollo Server + PostgreSQL + Redis</p>
        <hr />
        <HealthCheck />
      </main>
    </ApolloProvider>
  );
}
