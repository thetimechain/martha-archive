import type { FC } from "hono/jsx";
import { Layout } from "./components/Layout.js";
import { copy } from "../copy.js";

export const NotFoundPage: FC = () => (
  <Layout title="Not here">
    <main class="not-found page">
      <hr class="hairline" />
      <h1>{copy.notHere}</h1>
      <p>
        <a href="/episodes">{copy.return}</a>
      </p>
    </main>
  </Layout>
);
