import express from "express";
import cors from "cors";
import { ENV } from "./config/env.js"; // importa e valida o env
import router from "./routes/index.js";
import { errorHandler } from "./middlewares/errorHandler.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", router);

// Middleware global de erro
app.use(errorHandler);

app.get("/", (_req, res) =>
  res.json({ message: "API funcionando", env: ENV.NODE_ENV }),
);

app.listen(ENV.PORT, () => {
  console.log(
    `Servidor rodando em http://localhost:${ENV.PORT} (env: ${ENV.NODE_ENV})`,
  );
});
