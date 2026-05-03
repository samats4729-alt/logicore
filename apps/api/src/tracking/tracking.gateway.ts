import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TrackingService } from './tracking.service';

@WebSocketGateway({
    cors: { origin: '*' },
    namespace: '/tracking',
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    constructor(private trackingService: TrackingService) { }

    handleConnection(client: Socket) {
        console.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        console.log(`Client disconnected: ${client.id}`);
    }

    /**
     * Водитель отправляет GPS координаты
     */
    @SubscribeMessage('gps:update')
    async handleGpsUpdate(client: Socket, payload: any) {
        const { driverId, orderId, latitude, longitude, accuracy, speed, heading } = payload;

        // Сохраняем в БД
        await this.trackingService.saveGpsPoint({
            driverId,
            orderId,
            latitude,
            longitude,
            accuracy,
            speed,
            heading,
            recordedAt: new Date(),
        });

        // Рассылаем всем подписчикам этого водителя/заявки
        this.server.to(`driver:${driverId}`).emit('gps:position', {
            driverId,
            orderId,
            latitude,
            longitude,
            speed,
            timestamp: new Date(),
        });

        if (orderId) {
            this.server.to(`order:${orderId}`).emit('gps:position', {
                driverId,
                orderId,
                latitude,
                longitude,
                speed,
                timestamp: new Date(),
            });
        }
    }

    /**
     * Подписка на обновления водителя
     */
    @SubscribeMessage('subscribe:driver')
    handleSubscribeDriver(client: Socket, driverId: string) {
        client.join(`driver:${driverId}`);
        return { success: true, room: `driver:${driverId}` };
    }

    /**
     * Подписка на обновления заявки
     */
    @SubscribeMessage('subscribe:order')
    handleSubscribeOrder(client: Socket, orderId: string) {
        client.join(`order:${orderId}`);
        return { success: true, room: `order:${orderId}` };
    }

    /**
     * Отписка
     */
    @SubscribeMessage('unsubscribe')
    handleUnsubscribe(client: Socket, room: string) {
        client.leave(room);
        return { success: true };
    }

    /**
     * Уведомление об изменении статуса заявки
     */
    emitOrderStatusChange(orderId: string, status: string, data?: any) {
        this.server.to(`order:${orderId}`).emit('order:status', {
            orderId,
            status,
            data,
            timestamp: new Date(),
        });
    }
}
