FROM debian

WORKDIR /home/root

RUN apt-get update && apt-get install curl -y
RUN curl -fsSL https://code-server.dev/install.sh | sh

EXPOSE 8080

CMD code-server --auth none --host 0.0.0.0
