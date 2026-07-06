const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const TOKEN = process.env.TOKEN;

// روم عمل البوت
const WORK_CHANNEL = "1483219896069525665";

// روم اللوق
const LOG_CHANNEL = "1490286354175758366";

// صلاحية إعطاء الإنذارات
const ALLOWED_ROLES = ["1523520246097514528"];

// الرولات والمدة
const ROLES = {
  verbal: { id: "1523525037162893373", name: "انذار شفهي", duration: 3 * 24 * 60 * 60 * 1000 }, // 3 أيام
  warn1: { id: "1523519282707828756", name: "انذار أول", duration: 14 * 24 * 60 * 60 * 1000 }, // أسبوعين
  warn2: { id: "1523519193314758758", name: "انذار ثاني", duration: 30 * 24 * 60 * 60 * 1000 }, // شهر
  warn3: { id: "1523519440451272794", name: "انذار ثالث", duration: 45 * 24 * 60 * 60 * 1000 }, // شهر ونصف
  block: { id: "1523519407379189890", name: "مستبعد من التقسيمة", duration: null },
  black: { id: "1498706382587822191", name: "بلاك ليست", duration: null },
  test: { id: null, name: "تجربة", duration: 60 * 1000 } // دقيقة تجربة
};

const temp = new Map();

// تسجيل السلاش كوماند
client.once("ready", async () => {
  console.log("Bot Ready");

  const cmd = new SlashCommandBuilder()
    .setName("انذارات")
    .setDescription("لوحة الانذارات")
    .addUserOption(o => o.setName("الشخص").setDescription("اختر الشخص").setRequired(true));

  await client.application.commands.set([cmd]);
});

// تعامل مع التفاعلات
client.on("interactionCreate", async interaction => {
  // أمر السلاش كوماند
  if (interaction.isChatInputCommand() && interaction.commandName === "انذارات") {
    if (!interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id))) 
      return interaction.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });

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
        { label: "بلاك ليست", value: "black" }
      ]);

    return interaction.reply({
      content: "اختر العقوبات:",
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });
  }

  // اختيار نوع العقوبة
  if (interaction.isStringSelectMenu() && interaction.customId === "types") {
    const data = temp.get(interaction.user.id);
    data.types = interaction.values;

    // إذا العقوبة محددة مدتها تلقائي
    const fixed = data.types.some(t => ["verbal", "warn1", "warn2", "warn3"].includes(t));
    if (fixed) {
      const modal = new ModalBuilder().setCustomId("reasonModal").setTitle("سبب العقوبة");
      const input = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("اكتب السبب")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // إذا العقوبة بلاك ليست أو استبعاد، يطلب تحديد المدة
    const menu = new StringSelectMenuBuilder()
      .setCustomId("duration")
      .setPlaceholder("اختر المدة")
      .addOptions([
        { label: "تجربة", value: "test" },
        { label: "دقيقة", value: "minute" },
        { label: "يوم", value: "day" },
        { label: "أسبوع", value: "week" },
        { label: "دائم", value: "permanent" }
      ]);

    return interaction.update({ content: "اختر المدة:", components: [new ActionRowBuilder().addComponents(menu)] });
  }

  // اختيار مدة للبلاك ليست أو استبعاد
  if (interaction.isStringSelectMenu() && interaction.customId === "duration") {
    const data = temp.get(interaction.user.id);
    data.duration = interaction.values[0];

    const modal = new ModalBuilder().setCustomId("reasonModal").setTitle("سبب العقوبة");
    const input = new TextInputBuilder().setCustomId("reason").setLabel("اكتب السبب").setStyle(TextInputStyle.Paragraph).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // بعد كتابة السبب
  if (interaction.isModalSubmit() && interaction.customId === "reasonModal") {
    await interaction.deferReply({ ephemeral: true });

    const data = temp.get(interaction.user.id);
    const reason = interaction.fields.getTextInputValue("reason");
    const member = await interaction.guild.members.fetch(data.target);

    for (const t of data.types) {
      const role = interaction.guild.roles.cache.get(ROLES[t].id);
      await member.roles.add(role);

      // المدة
      const duration = ROLES[t].duration || (data.duration === "test" ? ROLES["test"].duration : null);
      if (duration) {
        setTimeout(async () => {
          const role = interaction.guild.roles.cache.get(ROLES[t].id);
          if (role && member.roles.cache.has(role.id)) await member.roles.remove(role);

          // حذف اللوق بعد انتهاء المدة
          const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL);
          if (logChannel) {
            const messages = await logChannel.messages.fetch({ limit: 100 });
            const msgToDelete = messages.find(m => m.embeds.length && m.embeds[0].fields[0]?.value.includes(`<@${member.id}>`) && m.embeds[0].fields[2]?.value.includes(ROLES[t].name));
            if (msgToDelete) await msgToDelete.delete();
          }
        }, duration);
      }
    }

    // إنشاء اللوق مع المدة
    const punishNames = data.types.map(t => ROLES[t].name).join(" + ");
    const embed = new EmbedBuilder()
      .setTitle("🚨 تم إعطاء عقوبة")
      .setColor(0xFF4C4C)
      .addFields(
        { name: "👤 المستخدم", value: `<@${member.id}>`, inline: true },
        { name: "👮 الإداري", value: `<@${interaction.user.id}>`, inline: true },
        { name: "📋 العقوبات", value: punishNames },
        { name: "⏱ المدة", value: data.types.some(x => ["verbal","warn1","warn2","warn3"].includes(x)) ? ROLES[data.types[0]].duration ? `${ROLES[data.types[0]].duration / 1000 / 60 / 60} ساعة` : "دائم" : "حدد المدة", inline: false },
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
