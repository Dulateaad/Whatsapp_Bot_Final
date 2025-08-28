import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import dotenv from "dotenv";
import { spamKeywords } from "./keywords.js";

dotenv.config();

const premiumNumbers = (process.env.ALLOWED_NUMBERS || "").split(",");

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true }
});

client.on("qr", qr => qrcode.generate(qr, { small: true }));
client.on("ready", () => console.log("✅ Бот запущен"));

// Проверка текста
function containsSpam(text) {
  if (!text) return false;
  text = text.toLowerCase();
  return spamKeywords.some(word => text.includes(word.toLowerCase()));
}

client.on("message", async msg => {
  const chat = await msg.getChat();
  const sender = msg.from.split("@")[0];

  if (chat.isGroup) {
    if (premiumNumbers.includes(sender)) return;

    if (containsSpam(msg.body)) {
      await msg.delete(true);
      console.log(`❌ Удалено сообщение от ${sender}: ${msg.body}`);
    }
  }
});
