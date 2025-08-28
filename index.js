import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import qrcode from "qrcode-terminal";
import Tesseract from "tesseract.js";
import { Client, LocalAuth } from "whatsapp-web.js";
import { spamKeywords } from "./spamKeywords.js";

// ==== Paths & env ====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// директория для сессии WA и данных (на Render — примонтируй диск к /data)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, ".data");
const AUTH_DIR = process.env.AUTH_DIR || path.join(DATA_DIR, "session");
const WHITELIST_FILE = process.env.WHITELIST_FILE || path.join(DATA_DIR, "whitelist.json");

// вкл/выкл OCR картинок (по умолчанию включено)
const ENABLE_OCR = (process.env.ENABLE_OCR || "true").toLowerCase() === "true";
const OCR_LANG = process.env.OCR_LANG || "rus+eng"; // можно добавить "kaz", если установлен язык

// гарантируем каталоги
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(AUTH_DIR, { recursive: true });

// ==== whitelist helpers ====
function loadWhitelist() {
  if (!fs.existsSync(WHITELIST_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(WHITELIST_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveWhitelist(obj) {
  fs.writeFileSync(WHITELIST_FILE, JSON.stringify(obj, null, 2), "utf8");
}

// normalize: превращаем '7701xxx@c.us' → '7701xxx'
function normalizeJid(jid) {
  if (!jid) return "";
  const id = jid.split("@")[0];
  return id.replace(/[^\d+]/g, ""); // оставляем цифры и '+'
}

function isWhitelisted(jid) {
  const phone = normalizeJid(jid);
  const list = loadWhitelist();
  const until = list[phone];
  if (!until) return false;
  const now = new Date();
  const exp = new Date(until);
  return exp >= now;
}

// ==== spam checks ====
function isSpamText(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return spamKeywords.some(k => t.includes(k));
}

async function extractTextFromMedia(message) {
  try {
    const media = await message.downloadMedia();
    if (!media) return "";
    const buf = Buffer.from(media.data, "base64");
    const { data: { text } } = await Tesseract.recognize(buf, OCR_LANG);
    return text || "";
  } catch (e) {
    console.error("OCR error:", e.message);
    return "";
  }
}

// ==== WhatsApp client ====
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  }
});

client.on("qr", qr => qrcode.generate(qr, { small: true }));
client.on("ready", () => console.log("✅ Бот запущен и подключен к WhatsApp"));

client.on("message", async msg => {
  const chat = await msg.getChat();

  // === ЛИЧКА: команды админа ===
  if (!chat.isGroup) {
    const text = (msg.body || "").trim();
    const [cmd, phone, date] = text.split(/\s+/);

    if (cmd === "/addsub" && phone && date) {
      const list = loadWhitelist();
      list[phone.replace(/[^\d+]/g, "")] = date; // формат YYYY-MM-DD
      saveWhitelist(list);
      await msg.reply(`✅ Подписка добавлена: ${phone} до ${date}`);
      return;
    }

    if (cmd === "/removesub" && phone) {
      const list = loadWhitelist();
      delete list[phone.replace(/[^\d+]/g, "")];
      saveWhitelist(list);
      await msg.reply(`🗑️ Подписка удалена: ${phone}`);
      return;
    }

    if (cmd === "/showsubs") {
      const list = loadWhitelist();
      if (!Object.keys(list).length) {
        await msg.reply("📭 Подписок нет.");
        return;
      }
      const lines = Object.entries(list)
        .map(([p, d]) => `• ${p} → до ${d}`)
        .join("\n");
      await msg.reply(`📋 Активные подписки:\n${lines}`);
      return;
    }

    if (cmd === "/help") {
      await msg.reply(
        "Команды:\n" +
        "/addsub +7701xxxxxxx YYYY-MM-DD — добавить подписку\n" +
        "/removesub +7701xxxxxxx — удалить подписку\n" +
        "/showsubs — список подписчиков"
      );
      return;
    }

    return; // другие личные сообщения игнорим
  }

  // === ГРУППЫ: модерация ===
  const authorJid = msg.author || msg.from; // автор сообщения в группе
  if (isWhitelisted(authorJid)) return;

  // 1) текст
  const text = (msg.body || "");
  if (isSpamText(text)) {
    try {
      await msg.delete(true);
      console.log(`🚫 Удалено (текст): ${normalizeJid(authorJid)} → "${text.slice(0,120)}"`);
    } catch (e) {
      console.error("Delete text failed:", e.message);
    }
    return;
  }

  // 2) медиа (OCR)
  if (ENABLE_OCR && msg.hasMedia) {
    const ocrText = await extractTextFromMedia(msg);
    if (isSpamText(ocrText)) {
      try {
        await msg.delete(true);
        console.log(`🚫 Удалено (картинка/OCR): ${normalizeJid(authorJid)} → "${ocrText.slice(0,120)}"`);
      } catch (e) {
        console.error("Delete media failed:", e.message);
      }
    }
  }
});

client.initialize();
