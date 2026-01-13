import "dotenv/config";

// Воронки ArmoCRM
export const PIPELINES = {
  ru: Number(process.env.PIPELINE_RU),
  web: Number(process.env.PIPELINE_WEB),
  en: Number(process.env.PIPELINE_EN),
  main: Number(process.env.PIPELINE_MAIN),
};

export const TG = {
  main: { token: process.env.TG_TOKEN_MAIN, chat: process.env.TG_CHAT_MAIN },
  en: { token: process.env.TG_TOKEN_EN, chat: process.env.TG_CHAT_EN },
  ru: { token: process.env.TG_TOKEN_RU, chat: process.env.TG_CHAT_RU },
  web: { token: process.env.TG_TOKEN_WEB, chat: process.env.TG_CHAT_WEB },
};
