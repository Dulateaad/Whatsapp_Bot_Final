const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// Загружаем whitelist (подписки)
let whitelist = {};
if (fs.existsSync('whitelist.json')) {
    whitelist = JSON.parse(fs.readFileSync('whitelist.json'));
}

// 🔑 Твои ключевые слова рекламы
const keywords = [
    "купить", "скидка", "акция", "подписывайся",
    "ссылка", "зарегистрируйся", "продажа", "дешево"
];

// Создаем клиента
const client = new Client({
    authStrategy: new LocalAuth()
});

// Генерация QR-кода для входа
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

// Подключение
client.on('ready', () => {
    console.log('✅ Бот запущен и готов к работе!');
});

// Функция проверки подписки
function hasValidSubscription(number) {
    if (!whitelist[number]) return false;
    const until = new Date(whitelist[number]);
    return new Date() <= until;
}

// Обработка сообщений
client.on('message', async msg => {
    const chat = await msg.getChat();

    // 📌 Если в личку → команды управления подписками
    if (!chat.isGroup) {
        const parts = msg.body.trim().split(" ");

        if (parts[0] === "/addsub" && parts.length === 3) {
            const number = parts[1];
            const until = parts[2]; // формат YYYY-MM-DD
            whitelist[number] = until;
            fs.writeFileSync("whitelist.json", JSON.stringify(whitelist, null, 2));
            msg.reply(`✅ Подписка для ${number} добавлена до ${until}`);
        }

        if (parts[0] === "/showsubs") {
            let out = "📋 Список подписок:\n";
            for (const [num, date] of Object.entries(whitelist)) {
                out += `${num} → до ${date}\n`;
            }
            msg.reply(out);
        }

        return;
    }

    // 📌 Если это группа → проверка на рекламу
    const author = msg.author || msg.from;
    const text = msg.body.toLowerCase();

    // Если номер в подписке → пропускаем
    if (hasValidSubscription(author)) return;

    // Проверяем ключевые слова
    if (keywords.some(k => text.includes(k))) {
        try {
            await msg.delete(true);
            console.log(`❌ Рекламное сообщение удалено: ${msg.body}`);
        } catch (e) {
            console.log("⚠️ Не удалось удалить сообщение:", e.message);
        }
    }
});

// Запуск
client.initialize();
