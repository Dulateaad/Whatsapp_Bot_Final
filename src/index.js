import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Номера с подпиской (не удалять сообщения)
const premiumNumbers = (process.env.ALLOWED_NUMBERS || "").split(",");

// Инициализация WhatsApp клиента
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true }
});

client.on("qr", qr => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("✅ WhatsApp Bot готов к работе!");
});

// Проверка на рекламу
async function isSpam(text) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Ты фильтр. Определи, является ли сообщение рекламным." },
        { role: "user", content: text }
      ],
      max_tokens: 5
    });
    const result = response.choices[0].message.content.toLowerCase();
    return result.includes("да"); // бот ответит "да"/"нет"
  } catch (err) {
    console.error("Ошибка OpenAI:", err.message);
    return false;
  }
}

client.on("message", async msg => {
  const chat = await msg.getChat();

  // Проверяем только групповые чаты
  if (chat.isGroup) {
    const sender = msg.from.split("@")[0];

    if (premiumNumbers.includes(sender)) {
      console.log(`🚀 Премиум пользователь ${sender}, сообщение не удаляется.`);
      return;
    }

    if (await isSpam(msg.body)) {
      await msg.delete(true);
      console.log(`❌ Удалено рекламное сообщение от ${sender}`);
    }
  }
});

// В личку: добавить номер в премиум
client.on("message", async msg => {
  if (!msg.fromMe && !msg.isGroup) {
    if (msg.body.startsWith("premium")) {
      const [_, number, untilDate] = msg.body.split(" ");
      if (number) {
        premiumNumbers.push(number);
        console.log(`✅ Добавлен премиум-номер: ${number} до ${untilDate || "∞"}`);
        msg.reply(`Номер ${number} добавлен в премиум до ${untilDate || "∞"}`);
      }
    }
  }
});

client.initialize();
