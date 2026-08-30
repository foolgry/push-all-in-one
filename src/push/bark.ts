import debug from 'debug'
import { Send } from '@/interfaces/send'
import { ajax } from '@/utils/ajax'
import { SendResponse } from '@/interfaces/response'
import { ConfigSchema, OptionSchema } from '@/interfaces/schema'
import { validate } from '@/utils/validate'

const Debugger = debug('push:bark')

export interface BarkConfig {
    /**
     * Bark 服务器地址。默认为 https://api.day.app，支持自建服务端，例如 https://bark.example.com
     */
    BARK_SERVER_URL?: string

    /**
     * 设备 Key。在 Bark App 中获取
     */
    BARK_DEVICE_KEY: string
}

export type BarkConfigSchema = ConfigSchema<BarkConfig>
export const barkConfigSchema: BarkConfigSchema = {
    BARK_SERVER_URL: {
        type: 'string',
        title: 'Bark 服务器地址',
        description: '默认为 https://api.day.app，支持自建服务端，例如 https://bark.example.com',
        required: false,
        default: 'https://api.day.app',
    },
    BARK_DEVICE_KEY: {
        type: 'string',
        title: '设备 Key',
        description: '在 Bark App 中获取',
        required: true,
        default: '',
    },
} as const

export type BarkLevel = 'active' | 'timeSensitive' | 'passive' | 'critical'

export interface BarkOption {
    /**
     * 点击通知跳转的 URL
     */
    url?: string

    /**
     * 通知分组。同一分组的通知可折叠
     */
    group?: string

    /**
     * 通知铃声。参考 https://github.com/Finb/bark-server/tree/master/deploy
     */
    sound?: string

    /**
     * 通知图标 URL
     */
    icon?: string

    /**
     * 通知级别。active=默认，timeSensitive=时效性，passive=被动，critical=重要
     */
    level?: BarkLevel

    /**
     * 加密推送的密文（Bark 端到端加密）。传入后 body 将仅包含该密文，由 App 端解密
     */
    ciphertext?: string

    /**
     * Bark 端到端加密时与 ciphertext 配套传入的初始向量。随机 iv 必须随密文一起传给服务端，App 端才能解密。
     * 不加入 optionSchema：避免配置生成器诱导手动填写，该值应随加密过程一起生成
     */
    iv?: string

    /**
     * 其他 Bark 支持的参数，原样透传给 bark-server
     */
    [key: string]: unknown
}

// BarkOption 含 [key: string]: unknown 索引签名，直接作为 OptionSchema 的泛型会把索引签名也映射进 schema
// （unknown 回落为 select），导致 string 型条目类型冲突，因此基于去除索引签名后的具名属性子集定义
export type BarkOptionSchema = OptionSchema<Pick<BarkOption, 'url' | 'group' | 'sound' | 'icon' | 'level' | 'ciphertext'>>
export const barkOptionSchema: BarkOptionSchema = {
    url: {
        type: 'string',
        title: '点击通知跳转的 URL',
        description: '点击通知跳转的 URL',
        required: false,
        default: '',
    },
    group: {
        type: 'string',
        title: '通知分组',
        description: '同一分组的通知可折叠',
        required: false,
        default: '',
    },
    sound: {
        type: 'string',
        title: '通知铃声',
        description: '参考 https://github.com/Finb/bark-server/tree/master/deploy',
        required: false,
        default: '',
    },
    icon: {
        type: 'string',
        title: '通知图标 URL',
        description: '通知图标 URL',
        required: false,
        default: '',
    },
    level: {
        type: 'select',
        title: '通知级别',
        description: 'active=默认，timeSensitive=时效性，passive=被动，critical=重要',
        required: false,
        default: 'active',
        options: [
            {
                label: '默认',
                value: 'active',
            },
            {
                label: '时效性',
                value: 'timeSensitive',
            },
            {
                label: '被动',
                value: 'passive',
            },
            {
                label: '重要',
                value: 'critical',
            },
        ],
    },
    ciphertext: {
        type: 'string',
        title: '加密推送的密文',
        description: 'Bark 端到端加密。传入后 body 将仅包含该密文，由 App 端解密',
        required: false,
        default: '',
    },
} as const

export interface BarkResponse {
    /**
     * 正确为 200
     */
    code: number
    /**
     * 正确为 success
     */
    message: string
    timestamp: number
}

/**
 * Bark 推送（iOS）。官方文档 https://bark.day.app/
 *
 * @author foolgry
 * @date 2026-08-29
 * @export
 * @class Bark
 */
export class Bark implements Send {

    static readonly namespace = 'Bark'
    static readonly configSchema = barkConfigSchema
    static readonly optionSchema = barkOptionSchema

    /**
     * Bark 服务器地址
     *
     * @author foolgry
     * @date 2026-08-29
     * @private
     */
    private BARK_SERVER_URL: string

    /**
     * 设备 Key
     *
     * @author foolgry
     * @date 2026-08-29
     * @private
     */
    private BARK_DEVICE_KEY: string

    /**
     * 创建 Bark 实例
     * @author foolgry
     * @date 2026-08-29
     * @param config 配置
     */
    constructor(config: BarkConfig) {
        const { BARK_SERVER_URL, BARK_DEVICE_KEY } = config
        this.BARK_SERVER_URL = BARK_SERVER_URL || 'https://api.day.app'
        this.BARK_DEVICE_KEY = BARK_DEVICE_KEY
        Debugger('set BARK_SERVER_URL: "%s", BARK_DEVICE_KEY: "%s"', BARK_SERVER_URL, BARK_DEVICE_KEY)
        // 根据 configSchema 验证 config
        validate(config, Bark.configSchema)
    }

    /**
     * @author foolgry
     * @date 2026-08-29
     * @param title 推送标题
     * @param [desp=''] 推送内容
     * @param [option={}] 额外推送选项
     */
    async send(title: string, desp: string = '', option?: BarkOption): Promise<SendResponse<BarkResponse>> {
        Debugger('title: "%s", desp: "%s", option: "%o"', title, desp, option)
        const data = {
            device_key: this.BARK_DEVICE_KEY,
            title,
            body: desp,
            ...option,
        }
        return ajax({
            baseURL: this.BARK_SERVER_URL,
            url: '/push',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
            },
            data,
        })
    }

}
