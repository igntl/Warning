const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const TOKEN = process.env.TOKEN;

// 📌 الرومات
const MAIN_CHANNEL = "1483219896069525665"; // روم إعطاء العقوبات
const LOG_CHANNEL = "1490286354175758366"; // روم اللوق

// 📌 الرتب المسموح لهم بإعطاء العقوبات
const ALLOWED_ROLES = ["1523520246097514528"]; // مسؤولين الشكاوي

// ⚡ الإنذارات والرتب
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

  const cmd = new SlashCommandBuilder()
    .setName("انذارات")
    .setDescription("لوحة الانذارات")
    .addUserOption(o => o.setName("الشخص").setDescription("اختر الشخص").setRequired(true));

  await client.application.commands.set([cmd]);
});

client.on("interactionCreate", async interaction => {
  if (interaction.channel.id !== MAIN_CHANNEL) return;

  if (interaction.isChatInputCommand()) {
    const hasRole = interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id));
    if (!hasRole) return interaction.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });

    const user = interaction.options.getUser("الشخص");
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
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "types") {
    const data = temp.get(interaction.user.id);
    data.type = interaction.values[0];

    // إذا كانت البلاك ليست أو مستبعد، نطلب المدة
    if (["block", "black", "test"].includes(data.type)) {
      const durationMenu = new StringSelectMenuBuilder()
        .setCustomId("duration")
        .setPlaceholder("اختر المدة")
        .addOptions([
          { label: "دائم", value: "permanent" },
          { label: "يوم", value: "day" },
          { label: "أسبوع", value: "week" },
          { label: "تجربة دقيقة", value: "test" }
        ]);

      return interaction.update({ content: "اختر المدة:", components: [new ActionRowBuilder().addComponents(durationMenu)] });
    }

    // باقي الانذارات لهم مدة ثابتة مباشرة
    const modal = new ModalBuilder().setCustomId("reasonModal").setTitle("سبب العقوبة");
    const input = new TextInputBuilder().setCustomId("reason").setLabel("اكتب السبب").setStyle(TextInputStyle.Paragraph).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "duration") {
    const data = temp.get(interaction.user.id);
    data.duration = interaction.values[0];

    const modal = new ModalBuilder().setCustomId("reasonModal").setTitle("سبب العقوبة");
    const input = new TextInputBuilder().setCustomId("reason").setLabel("اكتب السبب").setStyle(TextInputStyle.Paragraph).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === "reasonModal") {
    await interaction.deferReply({ ephemeral: true });
    const data = temp.get(interaction.user.id);
    const reason = interaction.fields.getTextInputValue("reason");
    const member = await interaction.guild.members.fetch(data.target);

    let roleId = ROLES[data.type].id;
    let duration = ROLES[data.type].duration;

    if (data.duration) {
      switch (data.duration) {
        case "permanent": duration = null; break;
        case "day": duration = 24*60*60*1000; break;
        case "week": duration = 7*24*60*60*1000; break;
        case "test": duration = 60*1000; break;
      }
    }

    await member.roles.add(roleId);

    // إزالة الرول بعد انتهاء المدة
    if (duration) {
      setTimeout(async () => {
        if (member.roles.cache.has(roleId)) await member.roles.remove(roleId);

        // حذف رسالة اللوق بعد انتهاء المدة
        const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL);
        const messages = await logChannel.messages.fetch({ limit: 100 });
        messages.forEach(msg => {
          if (msg.embeds.length > 0 && msg.embeds[0].fields.some(f => f.value.includes(`<@${member.id}>`))) {
            msg.delete().catch(() => {});
          }
        });
      }, duration);
    }

    // إرسال اللوق
    const embed = new EmbedBuilder()
      .setTitle("🚨 تم إعطاء عقوبة")
      .setColor(0xFF4C4C)
      .addFields(
        { name: "👤 المستخدم", value: `<@${member.id}>`, inline: true },
        { name: "👮 الإداري", value: `<@${interaction.user.id}>`, inline: true },
        { name: "📋 العقوبة", value: ROLES[data.type].name },
        { name: "⏳ المدة", value: duration ? `${Math.floor(duration/60000)} دقيقة` : "دائم", inline: true },
        { name: "📝 السبب", value: reason }
      )
      .setTimestamp();

    const log = interaction.guild.channels.cache.get(LOG_CHANNEL);
    if (log) log.send({ embeds: [embed] });

    await interaction.editReply({ content: "✅ تم تنفيذ العقوبة" });
    temp.delete(interaction.user.id);
  }
});

client.login(TOKEN);
