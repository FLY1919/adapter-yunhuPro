import { Context } from '@koishijs/client';
import { defineComponent, ref, h, resolveComponent, watch } from 'vue';
import './index.scss';
export default (ctx: Context) =>
{
    ctx.page({
        name: '云湖官网控制台',
        path: '/yunhu-control',
        desc: "",
        authority: 4,
        component: defineComponent({
            setup()
            {
                const iframe = ref<HTMLIFrameElement>();
                return () => h(resolveComponent('k-layout'), {}, {
                    default: () => h('iframe', { ref: iframe, src: "https://www.yhchat.com/control", class: 'layout-iframe' }),
                });
            },
        }),
    });
};