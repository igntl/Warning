const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');
const schedule = require('node-schedule');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const warnings = {}; // لتخزين معلومات الانذارات

client.once('ready', () => {
    console.log(`${client.user.tag} is online!`);
});

// مثال إعطاء انذار
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'انذارات') {
        const userId = interaction.user.id;

        if (!warnings[userId]) {
            warnings[userId] = [];
        }

        // إضافة انذار جديد
        const newWarning = {
            type: 'تجربة',
            remaining: 1, // عدد الانذارات المتبقية
            duration: 1 // مدة الانذار بالايام
        };

        warnings[userId].push(newWarning);

        await interaction.reply({
            content: `تم 🚨 إعطاء عقوبة\nالمستخدم: <@${userId}>\nنوع العقوبة: ${newWarning.type}\nالمدة: ${newWarning.duration} يوم\nعدد الانذارات المتبقية: ${newWarning.remaining}`,
            ephemeral: false
        });
    }

    if (interaction.commandName === 'فحص') {
        const userId = interaction.user.id;

        if (!warnings[userId] || warnings[userId].length === 0) {
            return interaction.reply({ content: 'لا يوجد انذارات على هذا المستخدم', ephemeral: true });
        }

        let replyText = `انذارات <@${userId}>:\n`;
        warnings[userId].forEach((w, i) => {
            replyText += `${i+1}. نوع الانذار: ${w.type}, المدة المتبقية: ${w.duration} يوم, الانذارات المتبقية: ${w.remaining}\n`;
        });

        await interaction.reply({ content: replyText, ephemeral: false });
    }
});

// تسجيل أوامر سلاش
client.on('ready', async () => {
    const guild = client.guilds.cache.get('GUILD_ID_HERE'); // ضع هنا ايدي السيرفر
    await guild.commands.create(
        new SlashCommandBuilder()
            .setName('انذارات')
            .setDescription('إعطاء انذار لمستخدم')
    );

    await guild.commands.create(
        new SlashCommandBuilder()
            .setName('فحص')
            .setDescription('فحص الانذارات للمستخدم')
    );
});

client.login('YOUR_BOT_TOKEN_HERE');
