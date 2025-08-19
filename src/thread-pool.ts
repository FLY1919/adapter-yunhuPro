import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { FfmpegTask, FfmpegResult } from './ffmpeg';
import { Logger } from 'koishi';
import path from 'path';
const logger = new Logger('yunhu-thread-pool');

// 线程池状态
interface WorkerInfo {
  worker: Worker;
  busy: boolean;
  currentTask: {
    resolve: (result: FfmpegResult) => void;
    reject: (reason?: any) => void;
    timeout: NodeJS.Timeout;
    taskId: string;
  } | null;
}

export class FfmpegThreadPool {
  private workers: WorkerInfo[] = [];
  private taskQueue: Array<{
    task: FfmpegTask;
    resolve: (result: FfmpegResult) => void;
    reject: (reason?: any) => void;
  }> = [];
  private taskCounter = 0;
  
  constructor(poolSize: number = cpus().length) {
    // 创建工作线程
    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(path.resolve(__dirname, 'ffmpeg.ts'));
      
      const workerInfo: WorkerInfo = {
        worker,
        busy: false,
        currentTask: null
      };
      
      this.workers.push(workerInfo);
      
      // 处理工作线程消息
      worker.on('message', (result: FfmpegResult) => {
        this.handleWorkerResponse(worker, result);
      });
      
      // 处理工作线程错误
      worker.on('error', (error) => {
        logger.error(`工作线程错误: ${error.message}`);
        this.handleWorkerError(worker, error);
      });
      
      // 处理工作线程退出
      worker.on('exit', (code) => {
        if (code !== 0) {
          logger.warn(`工作线程异常退出，退出码: ${code}`);
        }
        this.replaceWorker(worker);
      });
    }
    
    logger.info(`创建 FFmpeg 线程池，大小: ${poolSize}`);
  }
  
  /**
   * 执行 FFmpeg 任务
   * @param task 任务对象
   * @returns 任务结果
   */
  executeTask(task: FfmpegTask): Promise<FfmpegResult> {
    // 生成唯一任务ID
    this.taskCounter++;
    const taskId = `task-${this.taskCounter}`;
    task.taskId = taskId;
    
    return new Promise((resolve, reject) => {
      // 尝试立即执行
      const freeWorker = this.getFreeWorker();
      if (freeWorker) {
        this.runTask(freeWorker, task, resolve, reject);
      } else {
        // 加入队列
        this.taskQueue.push({ task, resolve, reject });
        logger.debug(`任务 ${taskId} 加入队列，当前队列长度: ${this.taskQueue.length}`);
      }
    });
  }
  
  /**
   * 获取空闲工作线程
   * @returns 空闲工作线程或 null
   */
  private getFreeWorker(): WorkerInfo | null {
    for (const workerInfo of this.workers) {
      if (!workerInfo.busy) {
        return workerInfo;
      }
    }
    return null;
  }
  
  /**
   * 执行任务
   * @param workerInfo 工作线程信息
   * @param task 任务
   * @param resolve 成功回调
   * @param reject 失败回调
   */
  private runTask(
  workerInfo: WorkerInfo,
  task: FfmpegTask,
  resolve: (result: FfmpegResult) => void,
  reject: (reason?: any) => void
) {
  // 根据视频时长动态计算超时时间
  let timeoutMs = 300 * 1000; // 默认5分钟
  
  if (task.type === 'compress-video' && task.options?.duration) {
    // 每1秒视频允许10秒处理时间，最小1分钟，最大30分钟
    const duration = task.options.duration;
    timeoutMs = Math.max(60 * 1000, Math.min(30 * 60 * 1000, duration * 10 * 1000));
    
    logger.info(`设置视频压缩超时时间: ${Math.floor(timeoutMs/1000)}秒 (基于${duration}秒视频)`);
  }

    
    // 存储回调
    const timeout = setTimeout(() => {
      logger.error(`任务 ${task.taskId} 超时`);
      workerInfo.busy = false;
      workerInfo.currentTask = null;
      reject(new Error('FFmpeg 任务超时'));
      this.processNextTask();
    }, timeoutMs);

    workerInfo.currentTask = {
      resolve,
      reject,
      timeout,
      taskId: task.taskId!
    };
    
    // 发送任务到工作线程
    workerInfo.worker.postMessage(task);
    logger.debug(`任务 ${task.taskId} 已分配给工作线程`);
  }
  
  /**
   * 处理工作线程响应
   * @param worker 工作线程
   * @param result 结果
   */
  // ... 文件开头部分保持不变 ...

private handleWorkerResponse(worker: Worker, result: FfmpegResult) {
  const workerInfo = this.workers.find(w => w.worker === worker);
  
  // 增强空值检查
  if (!workerInfo) {
    logger.warn('收到来自未知工作线程的响应');
    return;
  }
  
  if (!workerInfo.currentTask) {
    logger.warn('收到响应但没有当前任务');
    return;
  }

  // 检查任务ID是否匹配
  if (result.taskId !== workerInfo.currentTask.taskId) {
    logger.warn(`任务ID不匹配: ${result.taskId} vs ${workerInfo.currentTask.taskId}`);
    return;
  }
  
  try {
    // 清除超时
    clearTimeout(workerInfo.currentTask.timeout);
    
    // 重置工作线程状态
    workerInfo.busy = false;
    
    // 保存回调引用
    const { resolve, reject } = workerInfo.currentTask;
    
    // 立即清除当前任务引用
    workerInfo.currentTask = null;
    
    if (result.success) {
      logger.info(`任务 ${result.taskId} 完成`);
      resolve(result);
    } else {
      logger.error(`任务 ${result.taskId} 失败: ${result.error || '未知错误'}`);
      reject(new Error(result.error || 'FFmpeg 任务失败'));
    }
  } catch (error) {
    logger.error(`处理工作线程响应时出错: ${error.message}`);
  } finally {
    // 处理队列中的下一个任务
    this.processNextTask();
  }
}

private handleWorkerError(worker: Worker, error: Error) {
  const workerInfo = this.workers.find(w => w.worker === worker);
  if (!workerInfo) return;
  
  try {
    // 如果有当前任务，处理错误
    if (workerInfo.currentTask) {
      clearTimeout(workerInfo.currentTask.timeout);
      
      // 保存回调引用
      const { reject } = workerInfo.currentTask;
      
      // 立即清除当前任务引用
      workerInfo.currentTask = null;
      
      // 拒绝任务
      reject(error);
    }
  } catch (handleError) {
    logger.error(`处理工作线程错误时出错: ${handleError.message}`);
  }
  
  // 标记为繁忙以阻止新任务分配
  workerInfo.busy = true;
  
  // 替换工作线程
  this.replaceWorker(worker);
}

// ... 文件剩余部分保持不变 ...
  
  /**
   * 替换工作线程
   * @param oldWorker 旧工作线程
   */
  private replaceWorker(oldWorker: Worker) {
    const index = this.workers.findIndex(w => w.worker === oldWorker);
    if (index === -1) return;
    
    // 终止旧工作线程
    try {
      oldWorker.terminate();
    } catch (error) {
      logger.warn(`终止工作线程失败: ${error.message}`);
    }
    
    // 创建新工作线程
    const newWorker = new Worker(__filename);
    const newWorkerInfo: WorkerInfo = {
      worker: newWorker,
      busy: false,
      currentTask: null
    };
    
    this.workers[index] = newWorkerInfo;
    
    // 设置事件监听
    newWorker.on('message', (result: FfmpegResult) => {
      this.handleWorkerResponse(newWorker, result);
    });
    
    newWorker.on('error', (error) => {
      logger.error(`新工作线程错误: ${error.message}`);
      this.handleWorkerError(newWorker, error);
    });
    
    newWorker.on('exit', (code) => {
      if (code !== 0) {
        logger.warn(`新工作线程异常退出，退出码: ${code}`);
      }
      this.replaceWorker(newWorker);
    });
    
    logger.info(`已替换工作线程`);
    
    // 处理队列中的任务
    this.processNextTask();
  }
  
  /**
   * 处理队列中的下一个任务
   */
  private processNextTask() {
    if (this.taskQueue.length === 0) return;
    
    const freeWorker = this.getFreeWorker();
    if (!freeWorker) return;
    
    const nextTask = this.taskQueue.shift();
    if (nextTask) {
      logger.debug(`从队列中取出任务 ${nextTask.task.taskId} 执行，剩余队列长度: ${this.taskQueue.length}`);
      this.runTask(freeWorker, nextTask.task, nextTask.resolve, nextTask.reject);
    }
  }
  
  /**
   * 关闭线程池
   */
  shutdown() {
    logger.info('关闭 FFmpeg 线程池');
    
    // 终止所有工作线程
    for (const workerInfo of this.workers) {
      try {
        workerInfo.worker.terminate();
      } catch (error) {
        logger.warn(`终止工作线程失败: ${error.message}`);
      }
    }
    
    // 拒绝所有排队任务
    for (const queuedTask of this.taskQueue) {
      queuedTask.reject(new Error('线程池已关闭'));
    }
    
    this.workers = [];
    this.taskQueue = [];
  }
}