import express from "express";
import axios from "axios";
import "dotenv/config";
import cors from "cors";
import { PIPELINES, TG } from "./constants.js";
import {
  amo,
  normalizePhone,
  checkPhone,
  findContactByPhone,
  createContact,
  createLead,
} from "./amoApi.js";

// Amo CRM Client  - long token

// Реализация для АМО окончена - потом вынесу в отдельный код

const app = express();
app.use(cors());
app.use(express.json());

// AMO

// Amo CRM Client  - long token

// AMO

// Для тестирования отправки запросов
// amo.interceptors.request.use((config) => {
//   console.log("🚀 AMO REQUEST (before send)");
//   console.log(
//     JSON.stringify(
//       {
//         method: config.method,
//         url: `${config.baseURL}${config.url}`,
//         headers: config.headers,
//         params: config.params || null,
//         data: config.data || null,
//       },
//       null,
//       2
//     )
//   );

//   return config;
// });

app.get("/health", (req, res) => res.json({ ok: true }));
// app.get("/test-amo", async (req, res) => {
//   try {
//     const r = await amo.get("/account");
//     return res.json({ ok: true, data: r.data });
//   } catch (e) {
//     return res.status(500).json({
//       ok: false,
//       status: e.response?.status || null,
//       amo: e.response?.data || null,
//       message: e.message,
//       config: {
//         baseURL: e.config?.baseURL,
//         url: e.config?.url,
//         method: e.config?.method,
//         hasAuthHeader: !!e.config?.headers?.Authorization,
//       },
//     });
//   }
// });

app.post("/api/lead", async (req, res) => {
  try {
    const { number, source, lang } = req.body || {};
    if (!number)
      return res.status(400).json({ ok: false, error: "number is required" });

    const key = TG[lang] ? lang : "main";
    const { token, chat } = TG[key];

    if (!token || !chat) {
      return res
        .status(500)
        .json({ ok: false, error: `Telegram config missing for lang=${key}` });
    }

    const message =
      `📨 Новая заявка с сайта\n` +
      `📋 Источник: ${source || key}\n` +
      `🌍 Страница: ${key}\n` +
      `📞 Телефон: ${number}\n` +
      `🕒 Время: ${new Date().toLocaleString("ru-RU")}`;

    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const tgResp = await axios.post(url, {
      chat_id: chat,
      text: message,
      disable_web_page_preview: true,
    });

    // Реализация AMOCRM
    // === amoCRM (поиск дублей по телефону) ===
    const phone = normalizePhone(number);
    // 1) ищем контакт
    const found = await findContactByPhone(phone);
    // 2) если не нашли — создаём
    let contact;
    if (checkPhone(phone)) {
      contact = found?.id ? found : await createContact(phone);
      console.log("Контакт не создан", phone);
    } else {
      contact = await createContact(phone);
      console.log("Создан новый контакт", phone);
    }

    if (!contact?.id) {
      return res
        .status(500)
        .json({ ok: false, error: "amo: failed to get contact" });
    }

    // 3) создаём сделку в нужной воронке и привязываем контакт
    const lead = await createLead({
      contactId: contact.id,
      lang: key, // важно: используем key (main/ru/en/web)
      source,
    });

    if (!lead?.id) {
      return res
        .status(500)
        .json({ ok: false, error: "amo: failed to create lead" });
    }

    // Реализация AMOCRM Конец

    // тут потом добавим amoCRM

    return res.json({
      ok: true,
      telegram: tgResp.data,
      amo: {
        is_duplicate: !!found?.id,
        contact_id: contact.id,
        lead_id: lead.id,
        pipeline_id: lead.pipeline_id,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "server error",
      details: err?.response?.data || err?.message || String(err),
    });
  }
});

app.listen(process.env.PORT || 3001, () => {
  console.log(`API running: http://localhost:${process.env.PORT || 3001}`);
});
