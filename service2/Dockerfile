
FROM golang:1.20-alpine
RUN apk update && apk add --no-cache procps coreutils

WORKDIR /app
COPY /src/service2.go .

RUN go build -o service2 service2.go

CMD ["/app/service2"]
