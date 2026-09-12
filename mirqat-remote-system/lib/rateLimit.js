import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

// 5 محاولات تسجيل دخول لكل مستخدم/IP كل 60 ثانية
// بادئة مفاتيح خاصة بهذا النظام (emp2) لتفادي التداخل مع أنظمة أخرى تشارك نفس حساب Upstash
const loginLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60 s'),
  prefix: 'ratelimit:emp2:login'
});

/** يرجّع true إن كان مسموحًا بالمحاولة، false إن تم تجاوز الحد */
export async function checkLoginRateLimit(identifier) {
  const { success } = await loginLimiter.limit(identifier);
  return success;
}
