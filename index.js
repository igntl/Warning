const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const TOKEN = process.env.TOKEN;

// 📌 IDs
const SOURCE_CHANNEL = "1483219896069525665";
const LOG_CHANNEL = "1490286354175758366";
const ALLOWED_ROLE = "1523520246097514528";

// ⚡ الانذارات والرتب
const ROLES = {
    verbal: { id: "1523525037162893373", name: "انذار شفهي", duration: 3 * 24 * 60 * 60 * 1000 }, // 3 أيام
    warn1: { id: "1523519282707828756", name: "انذار أول", duration: 14 * 24 * 60 * 60 * 1000 }, // أسبوعين
    warn2: { id: "1523519193314758758", name: "انذار ثاني", duration: 30 * 24 * 60 * 60 * 1000 }, // شهر
    warn3: { id: "1523519440451272794", name: "انذار ثالث", duration: 45 * 24 * 60 * 60 * 1000 }, // شهر ونصف
    block: { id: "1523519407379189890", name: "مستبعد من التقسيمة", duration: null },
    black: { id: "1498706382587822191", name: "بلاك ليست", duration: null },
    test: { id: null, name: "تجربة", duration: 60 * 1000 } // دقيقة
};

const temp = new Map();

client.once("ready", async () => {
    console.log("Bot Ready");

    const cmd = {
        name: "انذارات",
        description: "لوحة الانذارات",
    };

    await client.application.commands.set([cmd]);
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "انذارات") return;

    if (!interaction.member.roles.cache.has(ALLOWED_ROLE)) {
        return interaction.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });
    }

    const channel = interaction.guild.channels.cache.get(SOURCE_CHANNEL);
    if (!channel) return interaction.reply({ content: "❌ روم المصدر غير موجود", ephemeral: true });

    const user = interaction.options?.getUser ? interaction.options.getUser("الشخص") : null;
    if (!user) return interaction.reply({ content: "❌ لم يتم تحديد الشخص", ephemeral: true });

    temp.set(interaction.user.id, { target: user.id });

    const menu = new StringSelectMenuBuilder()
        .setCustomId("types")
        .setPlaceholder("اختر العقوبة")
        .addOptions([
            { label: "انذار شفهي", value: "verbal" },
            { label: "انذار أول", value: "warn1" },
            { label: "انذار ثاني", value: "warn2" },
            { label: "انذار ثالث", value: "warn3" },
            { label: "مستبعد من التقسيمة", value: "block" },
            { label: "بلاك ليست", value: "black" },
            { label: "تجربة", value: "test" }
        ]);

    return interaction.reply({
        content: "اختر العقوبة:",
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
    });
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    const data = temp.get(interaction.user.id);
    if (!data) return;

    // اختيار النوع
    if (interaction.customId === "types") {
        data.types = interaction.values;

        // تحقق إذا النوع يحتاج اختيار مدة
        if (data.types.some(t => t === "block" || t === "black" || t === "test")) {
            const durationMenu = new StringSelectMenuBuilder()
                .setCustomId("duration")
                .setPlaceholder("اختر المدة")
                .addOptions([
                    { label: "تجربة", value: "test" },
                    { label: "يوم", value: "day" },
                    { label: "اسبوع", value: "week" },
                    { label: "دائم", value: "permanent" }
                ]);

            return interaction.update({
                content: "اختر المدة:",
                components: [new ActionRowBuilder().addComponents(durationMenu)]
            });
        }

        // انذارات ثابتة المدة → انتقل مباشرة للسبب
        const modal = new ModalBuilder().setCustomId("reasonModal").setTitle("سبب العقوبة");
        const input = new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("اكتب السبب")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    // اختيار مدة
    if (interaction.customId === "duration") {
        data.duration = interaction.values[0];

        const modal = new ModalBuilder().setCustomId("reasonModal").setTitle("سبب العقوبة");
        const input = new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("اكتب السبب")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }
});

// معالجة سبب العقوبة
client.on("interactionCreate", async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== "reasonModal") return;

    await interaction.deferReply({ ephemeral: true });

    const data = temp.get(interaction.user.id);
    const reason = interaction.fields.getTextInputValue("reason");
    const member = await interaction.guild.members.fetch(data.target);

    for (const t of data.types) {
        const roleId = ROLES[t].id;
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) continue;

        await member.roles.add(role);

        // مدة الانذار
        let duration = ROLES[t].duration;
        if (!duration && data.duration) {
            const durKey = data.duration;
            duration = ROLES[durKey]?.duration || (durKey === "day" ? 24 * 60 * 60 * 1000 : durKey === "week" ? 7 * 24 * 60 * 60 * 1000 : null);
        }

        if (duration) {
            setTimeout(async () => {
                const r = interaction.guild.roles.cache.get(roleId);
                if (r && member.roles.cache.has(r.id)) {
                    await member.roles.remove(r);

                    // حذف اللوق بعد انتهاء مدة البلاك او المستبعد
                    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL);
                    if (logChannel) {
                        const messages = await logChannel.messages.fetch({ limit: 100 });
                        messages.forEach(m => {
                            if (m.embeds.length > 0) {
                                const embed = m.embeds[0];
                                if (embed.fields.some(f => f.value.includes(member.id))) {
                                    m.delete().catch(() => {});
                                }
                            }
                        });
                    }
                }
            }, duration);
        }
    }

    // إنشاء اللوق
    const logEmbed = new EmbedBuilder()
        .setTitle("🚨 تم إعطاء عقوبة")
        .setColor(0xFF4C4C)
        .addFields(
            { name: "👤 المستخدم", value: `<@${member.id}>`, inline: true },
            { name: "👮 الإداري", value: `<@${interaction.user.id}>`, inline: true },
            { name: "📋 العقوبات", value: data.types.map(t => ROLES[t].name).join(" + ") },
            { name: "⏱ المدة", value: (() => {
                const t = data.types[0];
                if (ROLES[t].duration) {
                    const ms = ROLES[t].duration;
                    return `${Math.floor(ms / (24*60*60*1000))} يوم`;
                } else if (data.duration === "test") return "1 دقيقة";
                else return "محددة";
            })(), inline: true },
            { name: "📝 السبب", value: reason }
        )
        .setTimestamp();

    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL);
    if (logChannel) logChannel.send({ embeds: [logEmbed] });

    await interaction.editReply({ content: "✅ تم تنفيذ العقوبة" });
    temp.delete(interaction.user.id);
});

client.login(TOKEN);
