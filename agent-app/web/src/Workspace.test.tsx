import {render,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import {LAST_WORK,PENDING} from './workspace';

const result={task_id:'old-work',optimized_title:'Saved product copy',selling_points:['Point'],description:'Details kept',social_copy:'Social kept',seo_keywords:['cup'],platform:'taobao',image:{media_url:'/media/image/old.png',image_prompt:'original prompt'},video:{media_url:'/media/video/old.mp4',video_prompt:'video kept'}};
const task={task_id:'old-work',kind:'all',status:'succeeded',product:{title:'Travel cup',attributes:{Size:'500ml'},platform:'taobao'},result};
const response=(data:unknown)=>new Response(JSON.stringify(data),{status:200});
beforeEach(()=>{localStorage.clear();vi.stubGlobal('fetch',vi.fn(async()=>response({status:'ok'})))});

it('restores the edited brief, custom prompt and selected mode after remount',async()=>{
  const user=userEvent.setup();const page=render(<App/>);
  await user.type(screen.getByPlaceholderText('例如：真无线降噪耳机'),'Travel cup');
  await user.click(screen.getByRole('button',{name:'完整素材包'}));
  await user.type(screen.getByLabelText('自定义视频提示词'),'soft natural light');
  page.unmount();render(<App/>);
  await waitFor(()=>expect(screen.getByText("服务已连接")).toBeInTheDocument());
  expect(screen.getByDisplayValue('Travel cup')).toBeInTheDocument();
  expect(screen.getByDisplayValue('soft natural light')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'完整素材包'})).toHaveClass('active');
});

it('reopens history with the original brief, assets and kit download',async()=>{
  const user=userEvent.setup();
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>response(url.includes('/history?')?{items:[{...task,title:'Travel cup',created_at:'2026-10-29T00:00:00Z'}],total:1}:url.endsWith('/tasks/old-work')?task:{status:'ok'})));
  render(<App/>);await user.click(screen.getByRole('button',{name:'历史作品'}));
  await user.click(await screen.findByRole('button',{name:'打开作品'}));
  expect(await screen.findByText('Saved product copy')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Travel cup')).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'下载素材包'})).toHaveAttribute('href','/api/tasks/old-work/download');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('resumes a pending task after reload without submitting another generation',async()=>{
  localStorage.setItem(PENDING,'old-work');
  const fetchMock=vi.fn(async(url:string)=>response(url.endsWith('/tasks/old-work')?task:{status:'ok'}));
  vi.stubGlobal('fetch',fetchMock);render(<App/>);
  expect(await screen.findByText('Saved product copy')).toBeInTheDocument();
  expect(localStorage.getItem(PENDING)).toBeNull();
  expect(localStorage.getItem(LAST_WORK)).toBe('old-work');
  expect(fetchMock.mock.calls.every(([url])=>!url.includes('/generate'))).toBe(true);
});

it('regenerates only the selected image and keeps copy and video visible',async()=>{
  localStorage.setItem(LAST_WORK,'old-work');
  const user=userEvent.setup();
  const fetchMock=vi.fn(async(url:string,init?:RequestInit)=>{
    if(url.endsWith('/regenerate'))return response({task_id:'new-work'});
    if(url.endsWith('/tasks/new-work'))return response({...task,task_id:'new-work',result:{...result,task_id:'new-work',image:{image_prompt:'new prompt',media_url:'/media/image/new.png'}}});
    return response(url.endsWith('/tasks/old-work')?task:{status:'ok'});
  });
  vi.stubGlobal('fetch',fetchMock);render(<App/>);
  await screen.findByText('Saved product copy');
  const imageCard=screen.getByRole('img',{name:'图片'}).closest('article')!;
  await user.click(within(imageCard).getByRole('button',{name:'重新生成'}));
  const dialog=screen.getByRole('dialog',{name:'重新生成图片'});
  await user.clear(within(dialog).getByRole('textbox'));await user.type(within(dialog).getByRole('textbox'),'new prompt');
  await user.click(within(dialog).getByRole('button',{name:'重新生成'}));
  expect(await screen.findByText('new prompt')).toBeInTheDocument();
  expect(screen.getByText('Details kept')).toBeInTheDocument();expect(screen.getByText('video kept')).toBeInTheDocument();
  const call=fetchMock.mock.calls.find(([url])=>url.endsWith('/regenerate'))!;
  expect(JSON.parse(call[1]!.body as string)).toEqual({kind:'image',prompt:'new prompt'});
  expect(localStorage.getItem(LAST_WORK)).toBe('new-work');
});

it('shows failed task partial assets so the missing video can be retried',async()=>{
  localStorage.setItem(PENDING,'old-work');
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>response(url.endsWith('/tasks/old-work')?{...task,status:'failed',error:{message:'Video unavailable'},result:{...result,video:undefined}}:{status:'ok'})));
  render(<App/>);
  expect(await screen.findByText('Saved product copy')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'重新生成视频'})).toBeEnabled();
  expect(screen.getAllByText('视频暂时无法生成，请检查视频模型设置后重试。').length).toBeGreaterThan(0);
  expect(screen.queryByText('Video unavailable')).not.toBeInTheDocument();
  expect(screen.getByRole('img',{name:'图片'})).toHaveAttribute('src','/media/image/old.png');
  expect(localStorage.getItem(PENDING)).toBeNull();
});

it('opens a full image preview from example works and closes with Escape',async()=>{
  const user=userEvent.setup();
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>response(url.endsWith('/showcase')?[{filename:'sample.jpg',kind:'image',title:'产品展示',title_en:'Product detail',media_url:'/showcase/sample.jpg'}]:{status:'ok'})));
  render(<App/>);await user.click(screen.getByRole('button',{name:'示例作品'}));
  await user.click(await screen.findByRole('button',{name:'放大预览 · 产品展示'}));
  expect(screen.getByRole('dialog',{name:'产品展示'})).toBeInTheDocument();
  expect(within(screen.getByRole('dialog',{name:'产品展示'})).getByRole('link',{name:'下载'})).toHaveAttribute('href','/api/showcase/sample.jpg?download=true');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog',{name:'产品展示'})).not.toBeInTheDocument();
  expect(screen.getByRole('dialog',{name:'示例作品'})).toBeInTheDocument();
});
