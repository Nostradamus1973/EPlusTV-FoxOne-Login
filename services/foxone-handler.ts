import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import _ from 'lodash';
import moment from 'moment';

import {androidFoxOneUserAgent} from './user-agent';
import {configPath} from './config';
import {useFoxOneOnly4k, useFoxOne} from './networks';
import {IAdobeAuthFoxOne} from './adobe-helpers';
import {getRandomHex, normalTimeRange} from './shared-helpers';
import {ClassTypeWithoutMethods, IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {usesLinear, hideStudio} from './misc-db-service';
import {normalizeFoxOneStoredCategories, parseFoxOneCategories} from './foxone-categories';

interface IAppConfig {
  network: {
    identity: {
      host: string;
      entitlementsUrl: string;
      regcodeUrl: string;
      checkAdobeUrl: string;
      loginUrl: string;
      refreshTokenUrl: string;
    };
    auth: {
      loginWebsiteUrl: string;
    };
    apikey: string;
  };
  playback: {
    baseApiUrl: string;
  };
}

interface IProfileAuth {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  tokenExpiration?: number;
}

interface IAdobePrelimAuthToken {
  accessToken: string;
  tokenExpiration: number;
  viewerId: string;
  deviceId: string;
  profileId: string;
}

interface IFoxOneEvent {
  airing_type: string;
  audio_only: boolean;
  call_sign: string;
  tags: string[];
  entity_id: string;
  genre_metadata: {
    display_name: string;
  };
  title: string;
  description: string;
  sport_uri?: string;
  start_time: string;
  end_time: string;
  network: string;
  content_sku: string;
  stream_types: string[];
  images: {
    logo?: string;
    series_detail?: string;
    series_list?: string;
  };
  gracenote: {
    station_id?: string;
  };
  is_uhd?: boolean;
  is_multiview?: boolean;
  is_sportingevent?: boolean;
}

interface IFoxOneMeta {
  only4k?: boolean;
  uhd?: boolean;
  dtc_events?: boolean;
  local_station_call_signs?: string[] | string;
}

const foxOneConfigPath = path.join(configPath, 'foxone_tokens.json');
const FOX_ONE_HOME_ZIP = process.env.FOX_ONE_HOME_ZIP || '02891';

const getMaxRes = (res: string) => {
  switch (res) {
    case 'UHD/HDR':
      return 'UHD/HDR';
    default:
      return 'HD';
  }
};

const parseAirings = async (events: IFoxOneEvent[]) => {
  const useLinear = await usesLinear();
  const hide_studio = await hideStudio();

  const [now, inTwoDays] = normalTimeRange();

  const {meta} = await db.providers.findOneAsync<IProvider<any, IFoxOneMeta>>({name: 'foxone'});

  for (const event of events) {
    const entryExists = await db.entries.findOneAsync<IEntry>({id: `${event.entity_id}`});

    const categories = parseFoxOneCategories(event);

    if (entryExists?.from === 'foxone') {
      await db.entries.updateAsync<IEntry, any>({_id: (entryExists as any)._id}, {$set: {categories}});
    }

    if (!entryExists) {
      const isLinear = useLinear;
      
      if (!isLinear && event.airing_type !== 'live') {
        continue;
      }

      if (!isLinear && hide_studio && !event.is_sportingevent) {
        continue;
      }
      
      const start = moment(event.start_time);
      const end = moment(event.end_time);
      const originalEnd = moment(event.end_time);

      if (!isLinear) {
        end.add(1, 'hour');
      }

      if (end.isBefore(now) || start.isAfter(inTwoDays)) {
        continue;
      }

      if (meta.only4k && !_.some(categories, category => category === '4K')) {
        continue;
      }

      const eventName = `${event.sport_uri === 'NFL' ? `${event.sport_uri} - ` : ''}${event.title}`;

      console.log(`Adding event: ${event.call_sign}: ${eventName}`);

      await db.entries.insertAsync<IEntry>({
        categories,
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'foxone',
        id: event.entity_id,
        image: event.images?.logo || event.images?.series_detail || event.images?.series_list,
        name: eventName,
        network: event.call_sign,
        originalEnd: originalEnd.valueOf(),
        replay: event.airing_type !== 'live' && event.airing_type !== 'new',
        start: start.valueOf(),
        ...(isLinear && {
          channel: event.network,
          linear: true,
        }),
      });
    }
  }

  const existingFoxOneEntries = await db.entries.findAsync<IEntry>({from: 'foxone'});
  let normalizedCount = 0;
  for (const entry of existingFoxOneEntries) {
    const categories = normalizeFoxOneStoredCategories(entry.categories);
    if (JSON.stringify(categories) !== JSON.stringify(entry.categories)) {
      await db.entries.updateAsync<IEntry, any>({_id: (entry as any)._id}, {$set: {categories}});
      normalizedCount++;
    }
  }
  if (normalizedCount > 0) {
    console.log('Normalized categories for ' + normalizedCount + ' existing FOX One guide entries.');
  }
};

const FOXONE_APP_CONFIG = 'https://config.foxplus.com/androidtv/1.3/config/info.json';
// Will prelim token expire in the next month?
const willPrelimTokenExpire = (token: IAdobePrelimAuthToken): boolean =>
  new Date().valueOf() + 3600 * 1000 * 24 * 30 > (token?.tokenExpiration || 0);
// Will auth token expire in the next day?
const willAuthTokenExpire = (token: IAdobeAuthFoxOne): boolean =>
  new Date().valueOf() + 3600 * 1000 * 24 > (token?.tokenExpiration || 0);
const willProfileTokenExpire = (token: IProfileAuth): boolean =>
  new Date().valueOf() + 3600 * 1000 * 24 > (token?.tokenExpiration || 0);



class FoxOneHandler {
  public adobe_device_id?: string;
  public adobe_prelim_auth_token?: IAdobePrelimAuthToken;
  public adobe_auth?: IAdobeAuthFoxOne;
  public profile_auth?: IProfileAuth;

  private platform_location?: string;
  private platform_zip?: string;
  private contentEntitlement?: string;
  private homeMetroCode?: string;
  private homeZipCode?: string;
  private entitlements: string[] = [];
  private entArray: string[] = [];
  private contentEnt: any;
  private appConfig: IAppConfig;
  private stationMap: { [key: string]: { network: string; stationId: string; callSign: string } } = {}; // Add stationMap as a class property

  public initialize = async () => {
    const setup = (await db.providers.countAsync({name: 'foxone'})) > 0 ? true : false;

    if (!setup) {
      const data: TFoxOneTokens = {};

      if (useFoxOne) {
        this.loadJSON();

        data.adobe_auth = this.adobe_auth;
        data.adobe_device_id = this.adobe_device_id;
        data.adobe_prelim_auth_token = this.adobe_prelim_auth_token;
      }

      await db.providers.insertAsync<IProvider<TFoxOneTokens, IFoxOneMeta>>({
        enabled: useFoxOne,
        linear_channels: [
          {
            callSign: '',
            enabled: false,
            id: 'FOX',
            name: 'FOX',
            tmsId: '',
          },
          {
            callSign: '',
            enabled: false,
            id: 'MNTV',
            name: 'MyNetwork TV',
            tmsId: '',
          },
          {
            enabled: false,
            id: 'FS1',
            name: 'FS1',
            tmsId: '82547',
          },
          {
            enabled: false,
            id: 'FS2',
            name: 'FS2',
            tmsId: '59305',
          },
          {
            enabled: false,
            id: 'Big Ten Network',
            name: 'B1G Network',
            tmsId: '58321',
          },
          {
            enabled: false,
            id: 'FOX Deportes',
            name: 'FOX Deportes',
            tmsId: '72189',
          },
          {
            enabled: false,
            id: 'FOX News',
            name: 'FOX News Channel',
            tmsId: '60179',
          },
          {
            enabled: false,
            id: 'FOX Business',
            name: 'FOX Business Network',
            tmsId: '58718',
          },
          {
            enabled: false,
            id: 'TMZ',
            name: 'TMZ',
            tmsId: '149408',
          },
          {
            enabled: false,
            id: 'FOX Digital',
            name: 'Masked Singer',
          },
          {
            enabled: false,
            id: 'FOX Soul',
            name: 'Fox Soul',
            tmsId: '119212',
          },
          {
            enabled: false,
            id: 'FOX Weather',
            name: 'Fox Weather',
            tmsId: '121307',
          },
          {
            enabled: false,
            id: 'FOX LOCAL',
            name: 'Fox Live Now',
            tmsId: '119219',
          },
        ],
        meta: {
          local_station_call_signs: '',
          only4k: useFoxOneOnly4k,
          uhd: getMaxRes(process.env.MAX_RESOLUTION) === 'UHD/HDR',
        },
        name: 'foxone',
        tokens: data,
      });

      if (fs.existsSync(foxOneConfigPath)) {
        fs.rmSync(foxOneConfigPath);
      }
    }

    if (useFoxOne) {
      console.log('Using FOXONE variable is no longer needed. Please use the UI going forward');
    }
    if (useFoxOneOnly4k) {
      console.log('Using FOXONE_ONLY_4K variable is no longer needed. Please use the UI going forward');
    }
    if (process.env.MAX_RESOLUTION) {
      console.log('Using MAX_RESOLUTION variable is no longer needed. Please use the UI going forward');
    }

    const {enabled} = await db.providers.findOneAsync<IProvider<TFoxOneTokens, IFoxOneMeta>>({name: 'foxone'});

    if (!enabled) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    await this.load();

    await this.getEntitlements();
    
    // Update linear_channels during initialization
    await this.getEvents();
  };

  public getEvents = async (): Promise<IFoxOneEvent[]> => {
    if (!this.appConfig) {
      await this.getAppConfig();
    }

    const events: IFoxOneEvent[] = [];



    try {
      await this.getLocation();
      await this.getEntitlements();
      await this.getUserEntitlements();

      const { data: initData } = await axios.get<any>(
        'https://api.fox.com/dtc/product/config/v1/init',
        {
          headers: {
            'User-Agent': androidFoxOneUserAgent,
            authorization: `Bearer ${this.adobe_prelim_auth_token.accessToken}`,
            'x-fox-apikey': this.appConfig.network.apikey,
            'x-fox-content-entitlement': this.contentEntitlement || '',
            'x-fox-dma': this.homeMetroCode || '',
            'x-fox-home-dma': this.homeMetroCode || '',
            'x-fox-userauth': `Bearer ${this.adobe_prelim_auth_token.accessToken}`,
            'x-fox-zipcode': this.platform_zip,
            'x-home-zipcode': this.homeZipCode || '',
            'x-platform-location': this.platform_location,
          },
        },
      );

      const navigationUri = initData?.data?.dynamic_uris?.navigation_uri;

      if (!navigationUri) {
        throw new Error('navigation_uri not found in init data');
      }

      const { data: navData } = await axios.get<any>(
        `https://api.fox.com/dtc${navigationUri}?page=1&size=25`,
        {
          headers: {
            'User-Agent': androidFoxOneUserAgent,
            authorization: `Bearer ${this.adobe_prelim_auth_token.accessToken}`,
            'x-fox-apikey': this.appConfig.network.apikey,
            'x-fox-content-entitlement': this.contentEntitlement || '',
            'x-fox-dma': this.homeMetroCode || '',
            'x-fox-home-dma': this.homeMetroCode || '',
            'x-fox-userauth': `Bearer ${this.adobe_prelim_auth_token.accessToken}`,
            'x-fox-zipcode': this.platform_zip,
            'x-home-zipcode': this.homeZipCode || '',
            'x-platform-location': this.platform_location,
          },
        },
      );

      let lSchedUri: string | undefined = undefined;

      if (navData.data?.items) {
        for (const item of navData.data.items) {
          if (item.subitems) {
            for (const subitem of item.subitems) {
              if (subitem.subitems) {
                const foundDeepSubitem = subitem.subitems.find(
                  (deepSub: any) => deepSub.item_key === "guide"
                );

                if (foundDeepSubitem) {
                  lSchedUri = foundDeepSubitem.page_uri;
                  break;
                }
              }
            }
          }
          if (lSchedUri) {
            break;
          }
        }
      }
      const liveScheduleUri = lSchedUri;

      if (!liveScheduleUri) {
        throw new Error('live_schedule_page_uri not found in init data');
      }

      const { data: scheduleData } = await axios.get<any>(
        `https://api.fox.com/dtc${liveScheduleUri}`,
        {
          headers: {
            'User-Agent': androidFoxOneUserAgent,
            authorization: `Bearer ${this.adobe_prelim_auth_token.accessToken}`,
            'x-fox-apikey': this.appConfig.network.apikey,
            'x-fox-content-entitlement': this.contentEntitlement || '',
            'x-fox-dma': this.homeMetroCode || '',
            'x-fox-home-dma': this.homeMetroCode || '',
            'x-fox-userauth': `Bearer ${this.adobe_prelim_auth_token.accessToken}`,
            'x-fox-zipcode': this.platform_zip,
            'x-home-zipcode': this.homeZipCode || '',
            'x-platform-location': this.platform_location,
          },
        },
      );

      const containerUris: string[] =
        scheduleData?.data.containers?.map((c: any) => c.uri) || [];

      const allContainerData: any[] = [];

      for (const uri of containerUris) {
        try {
          const { data } = await axios.get<any>(
            `https://api.fox.com/dtc${uri}`,
            {
              headers: {
                'User-Agent': androidFoxOneUserAgent,
                authorization: `Bearer ${this.adobe_prelim_auth_token.accessToken}`,
                'x-fox-apikey': this.appConfig.network.apikey,
                'x-fox-content-entitlement': this.contentEntitlement || '',
                'x-fox-dma': this.homeMetroCode || '',
                'x-fox-home-dma': this.homeMetroCode || '',
                'x-fox-userauth': `Bearer ${this.adobe_prelim_auth_token.accessToken}`,
                'x-fox-zipcode': this.platform_zip,
                'x-home-zipcode': this.homeZipCode || '',
                'x-platform-location': this.platform_location,
              },
            },
          );

          if (data?.data?.items && Array.isArray(data.data.items)) {
            allContainerData.push(...data.data.items);
          } else {
            console.warn(`No items found in container ${uri}`);
          }

        } catch (err: any) {
          console.warn('FOX One event container request failed. Details withheld to protect session credentials.');
        }
      }



      const allEvents = allContainerData.map(event => {
        if (!event.genre_metadata) {
          event.genre_metadata = [];
        }
        return event;
      });

      const stationMap = {};
      for (const event of allEvents) {
        const { call_sign, network, gracenote } = event;

        if (call_sign && network && gracenote?.station_id) {
          if (!stationMap[network]) {
            stationMap[network] = {
              callSign: call_sign,
              network,
              stationId: gracenote.station_id,
            };
          }
        }
      }
      this.stationMap = stationMap;
      //console.log('station Mapping:    ', stationMap);

      // Update linear_channels with static tmsId except for FOX and MNTV
      const {linear_channels} = await db.providers.findOneAsync<IProvider>({name: 'foxone'});
      const updatedChannels = linear_channels.map(channel => {
        if (channel.id === 'FOX') {
          return {...channel, callSign: this.stationMap['FOX']?.callSign, tmsId: this.stationMap['FOX']?.stationId};
        } else if (channel.id === 'MNTV') {
          return {...channel, callSign: this.stationMap['MNTV']?.callSign, tmsId: this.stationMap['MNTV']?.stationId};
        } 
        return channel;
      });
      await db.providers.updateAsync<IProvider<TFoxOneTokens>, any>({name: 'foxone'}, {$set: {linear_channels: updatedChannels}});
      //console.log('getEvents: Updated linear_channels with stationMap');

      _.forEach(allEvents, m => {
        if (!m.content_sku) {
          return;
        }

        const hasEntitlement = this.entitlements.some(entitlement => {
          return m.content_sku.includes(entitlement) ||
                 entitlement.includes(m.content_sku);
        });
        
        const isChannelEnabled = linear_channels.find(c => c.id === m.network && c.enabled === true);

        if (
          m.call_sign &&
          hasEntitlement &&
          isChannelEnabled &&
          m.is_multiview !== true &&
          !m.audio_only &&
          m.start_time &&
          m.end_time &&
          m.entity_id &&
          !m.entity_id.includes("-long-")
        ) {
          events.push(m);
        }
      });

    } catch (e: any) {
      const status = e?.response?.status;
      console.error('FOX One event discovery failed (HTTP ' + (status || 'network') + '). Details withheld to protect session credentials.');
    }
    return events;
  };
  
public getStationMap = async (): Promise<typeof this.stationMap> => {
  try {
    //await this.getEvents();
    //console.log('getStationMap call to this.stationMap:', this.stationMap);
    return this.stationMap;
  } catch (e) {
    console.warn('FOX One station-map lookup failed.');
    throw e;
  }
};


  public async getLocation(): Promise<void> {
    const { data: locatorData } = await axios.get<any>(
      'https://ent.fox.com/locator/v1/location',
      {
        headers: {
          'User-Agent': androidFoxOneUserAgent,
          'x-api-key': this.appConfig.network.apikey,
        },
      }
    );

    const locationData = locatorData?.data?.metadata;
    this.platform_location = locationData?.['x-platform-location'] || 'Unknown Location';
    this.platform_zip = FOX_ONE_HOME_ZIP;
  }

  public async getUserEntitlements(): Promise<void> {
    try {
      await this.getLocation();

      if (!this.appConfig) {
        await this.getAppConfig();
      }

      try {
        await axios.put(
          'https://ent.fox.com/user-preferences/v1/home-location',
          { home_zip_code: this.platform_zip },
          {
            headers: {
              'authorization': `bearer ${this.adobe_auth?.accessToken || this.adobe_prelim_auth_token?.accessToken}`,
              'content-type': 'application/json',
              'user-agent': androidFoxOneUserAgent,
              'x-api-key': this.appConfig.network.apikey
            }
          }
        );
      } catch (error) {
        console.warn('FOX One home-location update failed (HTTP ' + (error?.response?.status || 'network') + ').');
        throw error;
      }
      const { data: userEnt } = await axios.get<any>(
        'https://ent.fox.com/user-preferences/v1/preferences',
        {
          headers: {
            'User-Agent': androidFoxOneUserAgent,
            authorization: `Bearer ${this.adobe_prelim_auth_token.accessToken}`,
            'x-api-key': this.appConfig.network.apikey || '',
            'x-platform-location': this.platform_location || '',
          },
        }
      );

      const results = userEnt?.data?.results || [];
      for (const item of results) {
        if (item.key === 'HOME_LOCATION' && item.value) {
          this.homeMetroCode = item.value.home_metro_code || null;
          this.homeZipCode = item.value.home_zip_code || null;
          break;
        }
      }

      const { data: userData } = await axios.post<any>(
        'https://api.fox.com/dtc/product/config/v1/keygen/secondary_info',
        this.contentEnt,
        {
          headers: {
            'User-Agent': androidFoxOneUserAgent,
            authorization: `Bearer ${this.adobe_prelim_auth_token.accessToken}`,
            'x-fox-apikey': this.appConfig.network.apikey,
            'x-fox-dma': this.homeMetroCode || '',
            'x-fox-home-dma': this.homeMetroCode || '',
            'x-fox-zipcode': this.platform_zip || '',
            'x-home-zipcode': this.homeZipCode || '',
            'x-platform-location': this.platform_location || '',
          },
        }
      );

      const headers = userData?.data?.headers || [];
      const entitlementHeader = headers.find((h: any) => h.key === 'x-fox-content-entitlement');

      if (entitlementHeader && entitlementHeader.value) {
        this.contentEntitlement = entitlementHeader.value;
      } else {
        console.warn('x-fox-content-entitlement not found in response');
      }

    } catch (e) {
      console.warn('FOX One user-entitlement setup failed (HTTP ' + (e?.response?.status || 'network') + ').');
    }
  }

  public loginWithProfile = async (email: string, password: string, deviceId: string): Promise<{ok: boolean; status: number; message: string}> => {
    if (!this.appConfig) await this.getAppConfig();
    if (!this.appConfig?.network?.apikey) return {message: 'FOX One app configuration did not provide an API key', ok: false, status: 0};

    try {
      const {data, status} = await axios.post<any>(
        'https://id.fox.com/account/login/v2',
        {deviceId, email, isTermsOfServiceAgreementNeeded: false, password, receipts: []},
        {headers: {'Content-Type': 'application/json; charset=utf-8', 'User-Agent': androidFoxOneUserAgent, 'x-api-key': this.appConfig.network.apikey, 'x-delegated-auth-flow': 'true'}},
      );

      const accessToken = data?.accessToken;
      if (!accessToken) return {message: 'Profile API login returned no access token', ok: false, status};

      this.profile_auth = {accessToken, idToken: data?.idToken, refreshToken: data?.refreshToken, tokenExpiration: data?.tokenExpiration ?? data?.expiresAt ?? data?.expiresIn};
      this.adobe_device_id = deviceId;
      this.adobe_prelim_auth_token = {accessToken, deviceId, profileId: data?.profileId || '', tokenExpiration: this.profile_auth.tokenExpiration || Date.now() + 3600000, viewerId: data?.viewerId || ''};

      const entitlementOk = await this.getEntitlements();
      if (!entitlementOk) {
        this.adobe_prelim_auth_token = undefined;
        return {message: 'Profile login succeeded, but the FOX One DTC entitlement service rejected the returned access token', ok: false, status};
      }

      await this.save();
      return {message: 'Direct FOX One Profile login succeeded and the returned token was accepted by the DTC entitlement service', ok: true, status};
    } catch (e: any) {
      const status = e?.response?.status || 0;
      const detail = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'request failed';
      return {message: `Profile API login failed: ${detail}`, ok: false, status};
    }
  };

  private refreshProfileToken = async (): Promise<boolean> => {
    const refreshToken = this.profile_auth?.refreshToken;

    if (!refreshToken) {
      console.log('FOX One Profile refresh skipped: no saved refresh token');
      return false;
    }

    if (!this.appConfig) {
      await this.getAppConfig();
    }

    const refreshTokenUrl = this.appConfig?.network?.identity?.refreshTokenUrl;
    const apiKey = this.appConfig?.network?.apikey;
    const identityHost = this.appConfig?.network?.identity?.host;

    if (!refreshTokenUrl || !apiKey || !identityHost) {
      console.error('FOX One Profile refresh skipped: incomplete identity configuration');
      return false;
    }

    try {
      const url = identityHost + refreshTokenUrl.replace('{REFRESH_TOKEN}', encodeURIComponent(refreshToken));
      const {data, status} = await axios.post<any>(url, undefined, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'User-Agent': androidFoxOneUserAgent,
          authorization: this.profile_auth?.accessToken || '',
          'x-api-key': apiKey,
          'x-delegated-auth-flow': 'true',
        },
      });

      const accessToken = data?.accessToken;
      if (!accessToken) {
        console.error('FOX One Profile refresh returned no access token (HTTP ' + status + ')');
        return false;
      }

      const tokenExpiration = data?.tokenExpiration ?? data?.expiresAt;
      const normalizedExpiration =
        typeof tokenExpiration === 'number' && tokenExpiration > 0 && tokenExpiration < 1e12
          ? tokenExpiration * 1000
          : tokenExpiration;

      this.profile_auth = {
        ...this.profile_auth,
        accessToken,
        idToken: data?.idToken || this.profile_auth?.idToken,
        refreshToken: data?.refreshToken || refreshToken,
        tokenExpiration: normalizedExpiration,
      };

      this.adobe_prelim_auth_token = {
        ...this.adobe_prelim_auth_token,
        accessToken,
        tokenExpiration: normalizedExpiration || Date.now() + 3600000,
      };

      await this.save();

      const entitlementOk = await this.getEntitlements();
      if (!entitlementOk) {
        console.error('FOX One Profile refresh succeeded, but entitlement validation failed');
        return false;
      }

      console.log('FOX One Profile token refreshed successfully');
      return true;
    } catch (e: any) {
      const status = e?.response?.status || 0;
      console.error('FOX One Profile token refresh failed (HTTP ' + (status || 'network') + '). Details withheld to protect session credentials.');
      return false;
    }
  };

  public refreshTokens = async () => {
    const {enabled} = await db.providers.findOneAsync<IProvider<TFoxOneTokens, IFoxOneMeta>>({name: 'foxone'});

    if (!enabled) {
      return;
    }

    if (!this.adobe_prelim_auth_token || willPrelimTokenExpire(this.adobe_prelim_auth_token)) {
      console.log('Updating FOX One prelim token');
      await this.getPrelimToken();
    }

    if (this.profile_auth?.accessToken && !this.adobe_auth) {
      if (willProfileTokenExpire(this.profile_auth)) {
        console.log('FOX One Profile token needs refresh; using saved refresh token');
        await this.refreshProfileToken();
      }
      return;
    }

    if (willAuthTokenExpire(this.adobe_auth)) {
      console.log('Refreshing TV Provider token (FOX One)');
      await this.authenticateRegCode();
    }
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled} = await db.providers.findOneAsync<IProvider<TFoxOneTokens, IFoxOneMeta>>({name: 'foxone'});

    if (!enabled) {
      return;
    }

    console.log('Looking for FOX One events...');

    try {
      const entries = await this.getEvents();
      await parseAirings(entries);
    } catch (e: any) {
      console.warn('FOX One event discovery failed (HTTP ' + (e?.response?.status || 'network') + ').');
      console.log('Could not parse FOX One events');
    }
  };

  public getEventData = async (eventId: string): Promise<TChannelPlaybackInfo> => {
    try {
      if (!this.appConfig) {
        await this.getAppConfig();
      }

      const data = await this.getStreamData(eventId);

      if (!data || !data?.stream?.playbackUrl) {
        throw new Error('Could not get stream data. Event might be upcoming, ended, or in blackout...');
      }

      const playURL = data.stream.playbackUrl;
      
      ///////////////// Debugging CDNs////////////////////
      // console.log('Playback Info:', {
      //   PlaybackURL: data.stream.playbackUrl,
      //   CDN: data.stream.cdn})

      if (!playURL) {
        throw new Error('Could not get stream data. Event might be upcoming, ended, or in blackout...');
      }

      return [
        playURL,
        {
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          Origin: 'https://www.fox.com',
          Referer: 'https://www.fox.com/',
          'User-Agent': androidFoxOneUserAgent,
        },
      ];
    } catch (e) {
      console.error('FOX One playback request failed. Details withheld to protect session credentials.');
      console.log('Could not get stream information!');
    }
  };

  private getStreamData = async (eventId: string): Promise<any> => {
    const {meta} = await db.providers.findOneAsync<IProvider<any, IFoxOneMeta>>({name: 'foxone'});
    const {uhd} = meta;

    const streamOrder = ['UHD/HDR', 'HD'];

    let resIndex = streamOrder.findIndex(i => i === getMaxRes(uhd ? 'UHD/HDR' : ''));

    if (resIndex < 0) {
      resIndex = 1;
    }

    if (!this.appConfig) {
      await this.getAppConfig();
    }

    let watchData;

    for (let a = resIndex; a < streamOrder.length; a++) {
      let deviceCapabilities: string;
      if (streamOrder[a] === 'UHD/HDR') {
        deviceCapabilities = 'color/HDR,maxRes/UHD';
      } else {
        deviceCapabilities = 'color/SDR,maxRes/HD';
      }

      try {
        const {data} = await axios.post(
          'https://prod.api.digitalvideoplatform.com/foxdtc/v3.0/watchlive',
          {
            asset: {
              id: eventId,
            },
            device: {
              height: 2160,
              model: 'onn. 4K Streaming Box',
              os: 'android',
              osv: '12',
              width: 3840,
            },
            stream: {
              type: 'Live',
            }
          },
          {
            headers: {
              'Accept-Encoding': 'gzip, deflate, br, zstd',
              'User-Agent': androidFoxOneUserAgent,
              authorization: this.profile_auth?.accessToken || this.adobe_auth?.accessToken || this.adobe_prelim_auth_token?.accessToken,
              'x-api-key': this.appConfig.network.apikey,
              'x-device-capabilities': deviceCapabilities,
              'x-platform-location': this.platform_location,
            },
          },
        );

        if (data?.stream?.playbackUrl) {
          const stream = data.stream;
          const qualityMetadata: Record<string, string | number | boolean | null> = {};
          for (const key of ['resolution', 'videoResolution', 'video_range', 'videoRange', 'hdr', 'isHdr', 'uhd', 'isUhd', 'quality', 'profile']) {
            const value = stream[key];
            if (['string', 'number', 'boolean'].includes(typeof value)) {
              qualityMetadata[key] = value;
            }
          }
          console.log('FOX One ' + streamOrder[a] + ' request returned a playback URL; safe quality metadata: ' + JSON.stringify(qualityMetadata));
          watchData = data;
          break;
        }
      } catch (e: any) {
        const status = e?.response?.status;
        const next = streamOrder[a + 1];
        console.warn('FOX One ' + streamOrder[a] + ' request failed (HTTP ' + (status || 'network') + '). ' +
          (next ? 'Trying ' + next + ' next. ' : 'No further quality fallback. ') +
          'Details withheld to protect session credentials.');
      }
    }
    return watchData;
  };

  private getAppConfig = async () => {
    try {
      const {data} = await axios.get<IAppConfig>(FOXONE_APP_CONFIG);
      this.appConfig = data;
    } catch (e: any) {
      console.warn('FOX One app-config request failed (HTTP ' + (e?.response?.status || 'network') + ').');
      console.log('Could not load API app config');
    }
  };

  private getEntitlements = async (): Promise<boolean> => {
    try {
      if (!this.appConfig) {
        await this.getAppConfig();
      }

      await this.getLocation();

      const {data} = await axios.get<any>(
        `https://ent.fox.com${this.appConfig.network.identity.entitlementsUrl}?device_type=&device_id=${this.adobe_device_id}&resource=&requestor=`,
        {
          headers: {
            'User-Agent': androidFoxOneUserAgent,
            authorization: this.adobe_auth?.accessToken || this.adobe_prelim_auth_token?.accessToken,
            'x-api-key': this.appConfig.network.apikey,
            'x-delegated-auth-flow': 'true',
            'x-fox-zipcode': this.platform_zip,
            'x-platform-location': this.platform_location,
            'x-refresh-token': this.profile_auth?.refreshToken || '',
            'x-signature-enabled': 'true',
          },
        },
      );

      this.entitlements = [];
      this.entArray = [];
      this.contentEnt = [];

      const results = data?.data?.results;
      if (Array.isArray(results)) {
        this.entArray = results;
        this.entitlements = results
          .map((item: any) => item.contentSku)
          .filter((sku: any) => typeof sku === 'string');
      }

      if (Array.isArray(this.entArray) && this.entArray.length > 0) {
        const transformedEntitlements = this.entArray.map((item: any) => ({
          content_sku: item.contentSku,
          entitlement_types: item.entitlementType || [],
          proxied_entitlement: item.proxiedEntitlement
        }));

        const finalEntitlements = {
          favorites: {
            leagues: [],
            movies: [],
            series: [],
            specials: [],
            teams: [],
          },
          user_entitlement: transformedEntitlements,
          user_onboarding_preferences: []
        };

        this.contentEnt = finalEntitlements;
      }
      return true;
    } catch (e: any) {
      console.warn('FOX One entitlement request failed (HTTP ' + (e?.response?.status || 'network') + ').');
      return false;
    }
  };

  private getPrelimToken = async (): Promise<void> => {
    try {
      if (!this.appConfig) {
        await this.getAppConfig();
      }

      const {data} = await axios.post<IAdobePrelimAuthToken>(
        `https://id.fox.com${this.appConfig.network.identity.loginUrl}`,
        {
          deviceId: this.adobe_device_id,
        },
        {
          headers: {
            'User-Agent': androidFoxOneUserAgent,
            'x-api-key': this.appConfig.network.apikey,
            'x-signature-enabled': true,
          },
        },
      );

      this.adobe_prelim_auth_token = data;
      await this.save();
    } catch (e: any) {
      console.warn('FOX One preliminary-token request failed (HTTP ' + (e?.response?.status || 'network') + ').');
      console.log('Could not get information to start Fox One login flow');
    }
  };

  public getAuthCode = async (): Promise<string> => {
    this.adobe_device_id = _.take(getRandomHex(), 16).join('');
    this.adobe_auth = undefined;

    if (!this.appConfig) {
      await this.getAppConfig();
    }

    await this.getPrelimToken();

    try {
      const {data} = await axios.post(
        `https://id.fox.com${this.appConfig.network.identity.regcodeUrl}`,
        {
          deviceID: this.adobe_device_id,
          isMvpd: true,
          selectedMvpdId: '',
        },
        {
          headers: {
            'User-Agent': androidFoxOneUserAgent,
            authorization: `Bearer ${this.adobe_prelim_auth_token.accessToken}`,
            'x-api-key': this.appConfig.network.apikey,
          },
        },
      );
      console.log(data.code)

      return data.code;
    } catch (e: any) {
      console.warn('FOX One authentication-code request failed (HTTP ' + (e?.response?.status || 'network') + ').');
      console.log('Could not start the authentication process for Fox One!');
    }
  };

  public authenticateRegCode = async (showAuthnError = true): Promise<boolean> => {
    if (!this.adobe_auth?.accessToken && !this.adobe_prelim_auth_token?.accessToken) {
      if (showAuthnError) console.log("FOX One is not authenticated yet");
      return false;
    }

    try {
      if (!this.appConfig) {
        await this.getAppConfig();
      }

      const {data} = await axios.get(`https://id.fox.com/v2.0/checkadobeauthn/v2/?device_id=${this.adobe_device_id}`, {
        headers: {
          'User-Agent': androidFoxOneUserAgent,
          authorization: !this.adobe_auth?.accessToken
            ? `Bearer ${this.adobe_prelim_auth_token.accessToken}`
            : this.adobe_auth.accessToken,
          'x-api-key': this.appConfig.network.apikey,
          'x-signature-enabled': true,
        },
      });

      this.adobe_auth = data;
      await this.save();

      await this.getEntitlements();

      return true;
    } catch (e) {
      if (e.response?.status !== 404) {
        if (showAuthnError) {
          if (e.response?.status === 410) {
            console.warn('FOX One Adobe AuthN token expired (HTTP 410).');
            console.log('Adobe AuthN token has expired for FOX One');
          }
        } else if (e.response?.status !== 410) {
          console.warn('FOX One provider-token check failed (HTTP ' + (e?.response?.status || 'network') + ').');
          console.log('Could not get provider token data for Fox One!');
        }
      }

      return false;
    }
  };

  private save = async () => {
    await db.providers.updateAsync({name: 'foxone'}, {$set: {tokens: _.omit(this, 'appConfig', 'entitlements', 'entArray', 'foxStationId', 'mnStationId', 'platform_location', 'platform_zip', 'contentEnt', 'homeMetroCode', 'homeZipCode','contentEntitlement', 'stationMap')}});
  };

  private load = async (): Promise<void> => {
    const {tokens} = await db.providers.findOneAsync<IProvider<TFoxOneTokens>>({name: 'foxone'});
    const {adobe_device_id, adobe_auth, adobe_prelim_auth_token, profile_auth} = tokens;

    this.adobe_device_id = adobe_device_id;
    this.adobe_auth = adobe_auth;
    this.adobe_prelim_auth_token = adobe_prelim_auth_token;
    this.profile_auth = profile_auth;
  };

  private loadJSON = () => {
    if (fs.existsSync(foxOneConfigPath)) {
      const {adobe_device_id, adobe_auth, adobe_prelim_auth_token} = fsExtra.readJSONSync(foxOneConfigPath);

      this.adobe_device_id = adobe_device_id;
      this.adobe_auth = adobe_auth;
      this.adobe_prelim_auth_token = adobe_prelim_auth_token;
    }
  };
}

export type TFoxOneTokens = ClassTypeWithoutMethods<FoxOneHandler>;
export const foxOneHandler = new FoxOneHandler();
