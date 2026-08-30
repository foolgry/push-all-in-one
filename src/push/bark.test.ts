import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/ajax', () => ({
    ajax: vi.fn(),
}))

import { Bark, BarkOption } from './bark'
import { ajax } from '@/utils/ajax'
import { validate } from '@/utils/validate'

const mockedAjax = vi.mocked(ajax)

describe('Bark', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockedAjax.mockResolvedValue({ data: { code: 200, message: 'success', timestamp: 1 }, status: 200, statusText: 'OK', headers: {}, config: {} } as any)
    })

    it('should validate config', () => {
        expect(() => new Bark({ BARK_DEVICE_KEY: '' })).toThrow('"BARK_DEVICE_KEY" 字段是必须的！')
    })

    it('should use default server url', async () => {
        const bark = new Bark({ BARK_DEVICE_KEY: 'barkdevicekey' })
        const result = await bark.send('测试标题', '测试内容')
        expect(result.data).toEqual({ code: 200, message: 'success', timestamp: 1 })
        const [config] = mockedAjax.mock.calls[0]
        expect(config.baseURL).toBe('https://api.day.app')
        expect(config.url).toBe('/push')
        expect(config.method).toBe('POST')
        expect(config.headers).toEqual({
            'Content-Type': 'application/json; charset=utf-8',
        })
        expect(config.data).toEqual({
            device_key: 'barkdevicekey',
            title: '测试标题',
            body: '测试内容',
        })
    })

    it('should support custom server url and extra options', async () => {
        const bark = new Bark({
            BARK_SERVER_URL: 'https://bark.example.com',
            BARK_DEVICE_KEY: 'barkdevicekey',
        })
        await bark.send('标题', '内容', { group: 'loopin', url: 'https://example.com/task/1', sound: 'minuet', level: 'timeSensitive' })
        const [config] = mockedAjax.mock.calls[0]
        expect(config.baseURL).toBe('https://bark.example.com')
        expect(config.data).toEqual({
            device_key: 'barkdevicekey',
            title: '标题',
            body: '内容',
            group: 'loopin',
            url: 'https://example.com/task/1',
            sound: 'minuet',
            level: 'timeSensitive',
        })
    })

    it('should send ciphertext only when encryption is used', async () => {
        const bark = new Bark({ BARK_DEVICE_KEY: 'barkdevicekey' })
        await bark.send('', '', { ciphertext: 'encrypted-payload' })
        const [config] = mockedAjax.mock.calls[0]
        expect(config.data).toEqual({
            device_key: 'barkdevicekey',
            title: '',
            body: '',
            ciphertext: 'encrypted-payload',
        })
    })

    it('should default desp to empty string', async () => {
        const bark = new Bark({ BARK_DEVICE_KEY: 'barkdevicekey' })
        await bark.send('只有标题')
        const [config] = mockedAjax.mock.calls[0]
        expect(config.data).toEqual({
            device_key: 'barkdevicekey',
            title: '只有标题',
            body: '',
        })
    })

    it('should reject invalid level by option schema enum', () => {
        // level 为联合类型枚举，schema 校验为 select，非法值应抛错，合法值应通过
        const invalidOption = { level: 'nope' } as unknown as BarkOption
        expect(() => validate(invalidOption, Bark.optionSchema)).toThrow('"level" 字段必须是以下选项之一')
        const validOption: BarkOption = { level: 'timeSensitive' }
        expect(() => validate(validOption, Bark.optionSchema)).not.toThrow()
    })
})
