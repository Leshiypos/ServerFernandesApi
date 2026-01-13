import express from "express";
import axios from "axios";
import "dotenv/config";
import cors from "cors";
import { PIPELINES, TG } from "./constants.js";

// Amo CRM Client  - long token

// Реализация для АМО окончена - потом вынесу в отдельный код

const app = express();
app.use(cors());
app.use(express.json());

// AMO

// Amo CRM Client  - long token
export function normalizePhone(phone) {
  return String(phone || "")
    .replace(/[^\d+]/g, "")
    .trim();
}
const amo = axios.create({
  baseURL: `https://${process.env.AMO_DOMAIN}/api/v4`,
  headers: {
    Authorization: `Bearer ${process.env.AMO_LONG_TOKEN}`,
    "Content-Type": "application/json",
  },
  timeout: 20000,
});
// Ищем контакт по телефону (простой поиск)
export async function findContactByPhone(phone) {
  const q = normalizePhone(phone);
  if (!q) return null;

  const r = await amo.get("/contacts", {
    params: { query: q, limit: 1 },
  });

  return r.data?._embedded?.contacts?.[0] || null;
}
// Создаём контакт
export async function createContact(phone) {
  const p = normalizePhone(phone);

  const payload = [
    {
      name: p || "Site lead",
      custom_fields_values: [
        {
          field_code: "PHONE",
          values: [{ value: p }],
        },
      ],
    },
  ];

  const r = await amo.post("/contacts", payload);
  return r.data?._embedded?.contacts?.[0] || null;
}
// Создаем сделку
export async function createLead({ contactId, lang, source }) {
  const key = PIPELINES[lang] ? lang : "main";

  const payload = [
    {
      name: `Заявка с сайта (${key})`,
      pipeline_id: PIPELINES[key],
      _embedded: {
        contacts: [{ id: contactId }],
      },
      tags_to_add: [{ name: `site_${key}` }],
      // Если хочешь — можно добавить заметку/описание:
      // _embedded: { ... } не для заметок. Заметки отдельным запросом.
    },
  ];

  const r = await amo.post("/leads", payload);
  return r.data?._embedded?.leads?.[0] || null;
}
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
app.get("/test-amo", async (req, res) => {
  try {
    const r = await amo.get("/account");
    return res.json({ ok: true, data: r.data });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      status: e.response?.status || null,
      amo: e.response?.data || null,
      message: e.message,
      config: {
        baseURL: e.config?.baseURL,
        url: e.config?.url,
        method: e.config?.method,
        hasAuthHeader: !!e.config?.headers?.Authorization,
      },
    });
  }
});

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
    const contact = found?.id ? found : await createContact(phone);

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
