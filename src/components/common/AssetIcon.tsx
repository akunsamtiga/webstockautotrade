// components/common/AssetIcon.tsx 

'use client'
import { useState } from 'react'
import Image from 'next/image'
import { TrendingUp } from 'lucide-react'

interface AssetIconProps {
  asset: {
    icon?: string
    name: string
    symbol: string
    category?: 'normal' | 'crypto'
    cryptoConfig?: {
      baseCurrency: string
    }
  }
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  showFallback?: boolean
}

const SIZE_CLASSES = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16'
}

const ICON_SIZE_CLASSES = {
  xs: 'w-4 h-4',
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
  lg: 'w-7 h-7',
  xl: 'w-10 h-10'
}

const TEXT_SIZE_CLASSES = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-2xl'
}

// Known crypto quote currencies — digunakan untuk strip suffix dari symbol
const QUOTE_CURRENCIES = ['USDT', 'USDC', 'BUSD', 'USD', 'EUR', 'BTC', 'ETH', 'BNB']

/**
 * Ekstrak base currency dari berbagai format symbol:
 *   "BTC/USD"  → "BTC"
 *   "BTCUSDT"  → "BTC"
 *   "BTCUSD"   → "BTC"
 *   "BTC-USD"  → "BTC"
 *   "BTC_USD"  → "BTC"
 */
const extractBaseCurrency = (symbol: string): string => {
  if (!symbol) return ''

  const upper = symbol.toUpperCase()

  // Format dengan separator: BTC/USD, BTC-USD, BTC_USD
  const withSep = upper.match(/^([A-Z]{2,6})[\/\-_]/)
  if (withSep) return withSep[1]

  // Format tanpa separator: BTCUSDT, BTCUSD — strip quote currency dari belakang
  for (const quote of QUOTE_CURRENCIES) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      const base = upper.slice(0, upper.length - quote.length)
      if (base.length >= 2) return base
    }
  }

  // Fallback: ambil 3–4 karakter pertama jika panjang ≥ 6
  if (upper.length >= 6) return upper.slice(0, upper.length >= 8 ? 4 : 3)

  return upper
}

const CRYPTO_ICON_MAP: Record<string, string> = {
  'BTC':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/btc.png',
  'ETH':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/eth.png',
  'BNB':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/bnb.png',
  'XRP':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/xrp.png',
  'ADA':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/ada.png',
  'SOL':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/sol.png',
  'DOT':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/dot.png',
  'DOGE':  'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/doge.png',
  'MATIC': 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/matic.png',
  'LTC':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/ltc.png',
  'AVAX':  'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/avax.png',
  'LINK':  'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/link.png',
  'UNI':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/uni.png',
  'ATOM':  'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/atom.png',
  'XLM':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/xlm.png',
  'TRX':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/trx.png',
  'ETC':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/etc.png',
  'NEAR':  'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/near.png',
  'APT':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/apt.png',
  'ARB':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/arb.png',
  'OP':    'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/op.png',
  'SHIB':  'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/shib.png',
  'FTM':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/ftm.png',
  'SAND':  'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/sand.png',
  'MANA':  'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/mana.png',
  'XMR':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/xmr.png',
  'ZEC':   'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/zec.png',
  'DASH':  'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/dash.png',
}

const getCryptoIconUrl = (currency: string): string =>
  CRYPTO_ICON_MAP[currency.toUpperCase()] || ''

/**
 * Tentukan apakah symbol adalah crypto berdasarkan nama/symbol,
 * sebagai fallback ketika `asset.category` tidak tersedia.
 */
const looksLikeCrypto = (asset: AssetIconProps['asset']): boolean => {
  if (asset.category === 'crypto') return true
  if (asset.category === 'normal') return false

  // Heuristik: cek apakah base currency ada di map
  const base = extractBaseCurrency(asset.symbol)
  return !!CRYPTO_ICON_MAP[base]
}

export default function AssetIcon({
  asset,
  size = 'md',
  className = '',
  showFallback = true
}: AssetIconProps) {
  const [imageError, setImageError] = useState(false)

  // ── Resolve icon URL ──────────────────────────────────────────
  let iconUrl = asset.icon

  // 1. Ganti URL cryptologos.cc (referrer block) dengan CDN aman
  if (iconUrl?.includes('cryptologos.cc')) {
    const base = asset.cryptoConfig?.baseCurrency || extractBaseCurrency(asset.symbol)
    iconUrl = base ? getCryptoIconUrl(base) : ''
  }

  // 2. Tidak ada icon dari API — coba derive dari cryptoConfig atau symbol
  if (!iconUrl) {
    const base = asset.cryptoConfig?.baseCurrency || extractBaseCurrency(asset.symbol)
    if (base) iconUrl = getCryptoIconUrl(base)
  }

  const isCrypto = looksLikeCrypto(asset)

  // ── Render image ─────────────────────────────────────────────
  if (iconUrl && !imageError) {
    return (
      <div className={`${SIZE_CLASSES[size]} rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 relative ${className}`}>
        <Image
          src={iconUrl}
          alt={`${asset.name} icon`}
          fill
          className="object-contain"
          onError={() => setImageError(true)}
        />
      </div>
    )
  }

  // ── Fallback ─────────────────────────────────────────────────
  if (showFallback) {
    // Label: base currency (maks 4 char) atau 2 char dari symbol
    const label = isCrypto
      ? (asset.cryptoConfig?.baseCurrency || extractBaseCurrency(asset.symbol)).slice(0, 4)
      : asset.symbol.slice(0, 2).toUpperCase()

    return (
      <div className={`
        ${SIZE_CLASSES[size]} rounded-lg flex items-center justify-center
        text-white font-bold flex-shrink-0 ${className} ${TEXT_SIZE_CLASSES[size]}
        bg-gradient-to-br ${isCrypto ? 'from-orange-400 to-yellow-500' : 'from-blue-400 to-purple-500'}
      `}>
        {isCrypto ? (
          <span className="text-[0.6em] font-extrabold leading-none">{label}</span>
        ) : (
          <TrendingUp className={ICON_SIZE_CLASSES[size]} />
        )}
      </div>
    )
  }

  return null
}