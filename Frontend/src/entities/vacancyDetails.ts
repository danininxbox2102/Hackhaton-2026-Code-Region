import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { ApiError, type Vacancy, type VacancyCard } from '../shared/api';
import { useSession } from './session';
export const vacancyFormats = { onsite: 'На месте', remote: 'Удалённо', hybrid: 'Гибрид', unknown: 'Не указано' };
const decimal = (value: string) => {
  const [integer, fraction] = value.split('.');
  return integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (fraction ? ',' + fraction : '');
};
export function vacancySalary(job: Pick<Vacancy, "salary_min" | "salary_max" | "currency" | "salary_period" | "salary_gross">) {
  const low = job.salary_min, high = job.salary_max;
  if (low == null && high == null) return 'Зарплата не указана';
  const amount = low != null && high != null ? `${decimal(low)} – ${decimal(high)}` : low != null ? `от ${decimal(low)}` : `до ${decimal(high!)}`;
  const periods: Record<string, string> = { month: 'мес.', hour: 'час', year: 'год', day: 'день', week: 'нед.' };
  return `${amount} ${job.currency === 'RUB' ? '₽' : job.currency || ''}${job.salary_period ? ` / ${periods[job.salary_period] || job.salary_period}` : ''}${job.salary_gross === 1 ? ' до налогов' : job.salary_gross === 0 ? ' на руки' : ''}`;
}
export function useVacancyDetails(id: () => string | undefined) {
  const session = useSession();
  const vacancy = ref<VacancyCard | null>(null);
  const skills = ref<{ id: string; name: string; is_required: 0 | 1 }[]>([]);
  const loading = ref(false), error = ref(''), status = ref(0);
  const outboundBusy = ref(false), outboundError = ref(''), outboundUrl = ref(''), unavailable = ref(false);
  let generation = 0, controller: AbortController | undefined, outboundController: AbortController | undefined;
  let popup: Window | null = null;
  function cancel() {
    generation++;
    controller?.abort(); outboundController?.abort();
    popup?.close(); popup = null;
    loading.value = false; outboundBusy.value = false;
  }
  async function load() {
    cancel();
    const current = id();
    vacancy.value = null; skills.value = []; error.value = ''; status.value = 0;
    outboundError.value = ''; outboundUrl.value = ''; unavailable.value = false;
    if (!current) return;
    const version = generation;
    controller = new AbortController(); loading.value = true;
    try {
      const response = await session.api.vacancy(current, { signal: controller.signal });
      if (version !== generation) return;
      if (response.vacancy?.id !== current || !Array.isArray(response.skills) || [response.vacancy.salary_min, response.vacancy.salary_max].some(v => v != null && typeof v !== 'string')) throw new Error('Invalid DTO');
      vacancy.value = response.vacancy; skills.value = response.skills;
    } catch (e) {
      if (version !== generation) return;
      status.value = e instanceof ApiError ? e.status : 0;
      error.value = status.value === 401 ? 'Сессия недействительна. Войдите повторно.' : status.value === 404 ? 'Вакансия не найдена или удалена.' : 'Не удалось загрузить вакансию. Повторите попытку.';
    } finally { if (version === generation) loading.value = false; }
  }
  const canOutbound = computed(() => vacancy.value?.status === 'active' && !unavailable.value && session.authenticated);
  async function outbound() {
    if (!canOutbound.value || outboundBusy.value) return;
    const current = id()!, version = generation;
    outboundBusy.value = true; outboundError.value = ''; outboundUrl.value = '';
    // Reserve a tab in the user gesture; navigate only after a successful POST.
    const bridge = (window as Window & {
      starterNative?: { platform: string; openExternal: (url: string) => Promise<boolean> }
    }).starterNative;
    const useDesktopBrowser = bridge?.platform === 'electron';
    if (!useDesktopBrowser) {
      try { popup = window.open('about:blank', '_blank'); if (popup) popup.opener = null; }
      catch { popup = null; }
    }
    outboundController = new AbortController();
    try {
      const response = await session.api.outbound(current, { signal: outboundController.signal });
      if (version !== generation) return;
      const url = new URL(response.originalUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsafe URL');
      if (useDesktopBrowser && bridge) {
        if (!(await bridge.openExternal(url.href))) outboundUrl.value = url.href;
      } else if (popup && !popup.closed) {
        popup.location.replace(url.href);
        popup = null;
      } else {
        outboundUrl.value = url.href;
        popup = null;
      }
    } catch (e) {
      if (version !== generation) return;
      popup?.close(); popup = null;
      if (e instanceof ApiError && e.status === 404) { unavailable.value = true; outboundError.value = 'Переход недоступен: вакансия удалена или находится в архиве.'; }
      else if (e instanceof ApiError && e.status === 401) outboundError.value = 'Сессия недействительна. Войдите повторно.';
      else outboundError.value = 'Не удалось открыть вакансию. Повторите попытку.';
    } finally { if (version === generation) outboundBusy.value = false; }
  }
  watch(id, () => { void load(); }, { immediate: true });
  onBeforeUnmount(cancel);
  return { authenticated: computed(() => session.authenticated), vacancy, skills, loading, error, status, load, cancel, outbound, outboundBusy, outboundError, outboundUrl, canOutbound };
}
