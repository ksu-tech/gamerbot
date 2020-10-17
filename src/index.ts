import { MikroORM } from '@mikro-orm/core/MikroORM';
import { registerFont } from 'canvas';
import { Client, Message } from 'discord.js';
import dotenv from 'dotenv';
import fse from 'fs-extra';
import _ from 'lodash/fp';
import YouTube from 'simple-youtube-api';
import yargsParser from 'yargs-parser';

import { commands } from './commands';
import { Config } from './entities/Config';
import * as eggs from './listeners/eggs';
import * as reactions from './listeners/reactions';
import * as voice from './listeners/voice';
import * as welcome from './listeners/welcome';
import mikroOrmConfig from './mikro-orm.config';
import { GuildGames, GuildQueue } from './types';
import { dbFindOneError, resolvePath } from './util';
import { Store } from './util/store';

dotenv.config({ path: resolvePath('.env') });

fse.mkdirp(resolvePath('data'));
fse.mkdirp(resolvePath('data/gifs'));

export const setPresence = (): void => {
  const num = eggs.get();
  const s = num === 1 ? '' : 's';
  client.user?.setPresence({
    activity: {
      name: `with ${num.toLocaleString()} egg${s} | $help`,
      type: 'PLAYING',
    },
  });
};

export const client = new Client({
  partials: ['MESSAGE', 'REACTION'],
  // disableMentions: 'everyone',
});
export const youtube = new YouTube(process.env.YT_API_KEY as string);

export const queueStore = new Store<GuildQueue>({
  path: 'data/queue.yaml',
  writeOnSet: false,
  readImmediately: false,
  dataLanguage: 'yaml',
});

export const gameStore = new Store<GuildGames>({
  path: 'data/games.yaml',
  writeOnSet: true,
  readImmediately: true,
  dataLanguage: 'yaml',
});

// register fonts for canvas
const fonts: Record<string, { family: string; weight?: string; style?: string }> = {
  'FiraSans-Regular.ttf': { family: 'Fira Sans' },
  'FiraSans-Italic.ttf': { family: 'Fira Sans', style: 'italic' },
  'FiraSans-Bold.ttf': { family: 'Fira Sans', weight: 'bold' },
  'FiraSans-BoldItalic.ttf': { family: 'Fira Sans', weight: 'bold', style: 'italic' },
};

Object.keys(fonts).forEach(filename =>
  registerFont(resolvePath('assets/fonts/' + filename), fonts[filename])
);

(async () => {
  // init db
  const orm = await MikroORM.init(mikroOrmConfig);
  await orm.getMigrator().up();

  client.on('message', async (msg: Message) => {
    if (msg.author.bot) return;
    if (msg.author.id == client.user?.id) return;
    if (!msg.guild) return; // don't respond to DMs

    queueStore.setIfUnset(msg.guild?.id as string, {
      videos: [],
      playing: false,
      currentVideoSecondsRemaining: 0,
    });

    const config = await (async () => {
      const existing = await orm.em.findOne(Config, { guildId: msg.guild?.id as string });
      if (existing) return existing;

      const fresh = orm.em.create(Config, { guildId: msg.guild?.id as string });
      await orm.em.persistAndFlush(fresh);
      return await orm.em.findOneOrFail(
        Config,
        { guildId: msg.guild?.id as string },
        { failHandler: dbFindOneError(msg.channel) }
      );
    })();

    eggs.onMessage(msg, config)();

    if (!msg.content.startsWith(config.prefix)) return;

    const [cmd, ...argv] = msg.content
      .slice(config.prefix.length)
      .replace(/ +/g, ' ')
      .split(' ');

    const commandClass = commands.find(v => {
      if (Array.isArray(v.cmd)) return v.cmd.some(c => c.toLowerCase() === cmd.toLowerCase());
      else return v.cmd.toLowerCase() === cmd.toLowerCase();
    });
    if (!commandClass) return;

    const args = yargsParser.detailed(
      argv,
      _.merge(commandClass.yargsSchema ?? {}, {
        configuration: { 'flatten-duplicate-arrays': false },
      } as yargsParser.Options)
    );

    if (args.error) msg.channel.send('warning: \n```\n' + args.error + '\n```');

    await commandClass.executor({
      msg,
      cmd,
      args: args.argv,
      em: orm.em,
      config,
      queueStore,
      gameStore,
    });

    orm.em.flush();
  });

  client.on('ready', () => {
    console.log(`${client.user?.tag} ready`);
    setPresence();
    setInterval(setPresence, 1000 * 60 * 10);
  });

  client
    .on('warn', console.warn)
    .on('error', console.error)
    .on('disconnect', () => console.log('client disconnected'))
    .on('guildCreate', async guild => {
      const fresh = orm.em.create(Config, { guildId: guild.id });
      await orm.em.persistAndFlush(fresh);
    })
    .on('guildDelete', async guild => {
      const config = await orm.em.findOne(Config, { guildId: guild.id });
      config && (await orm.em.removeAndFlush(config));
    })
    .on('guildMemberAdd', welcome.onGuildMemberAdd(orm.em))
    .on('messageDelete', eggs.onMessageDelete(orm.em))
    .on('messageUpdate', eggs.onMessageUpdate(orm.em))
    .on('voiceStateUpdate', voice.onVoiceStateUpdate())
    .on('messageReactionAdd', reactions.onMessageReactionAdd(orm.em))
    .on('messageReactionRemove', reactions.onMessageReactionRemove(orm.em))
    .login(process.env.DISCORD_TOKEN);
})().catch(console.error);
